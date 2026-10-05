/**
 * ==============================================================================
 * HỆ THỐNG GIÁM SÁT CÔNG VIỆC CÁN BỘ HIỆN TRƯỜNG
 * Cổng Đồng Bộ Dữ Liệu Tự Động Lên Google Drive & Google Sheets
 * Tác giả: Senior Full-stack Developer
 * ==============================================================================
 */

// ------------------------------------------------------------------------------
// CẤU HÌNH HỆ THỐNG
// ------------------------------------------------------------------------------
// Tên trang tính lưu trữ cơ sở dữ liệu trên Google Sheets
const SHEET_NAME = "Du_Lieu_Tong";

// Tên thư mục lưu trữ hình ảnh trên Google Drive
const DRIVE_FOLDER_NAME = "Hinh_Anh_Giam_Sat_Cong_Viec";

/**
 * 1. HÀM TIẾP NHẬN REQUEST GET (doGet)
 * Cho phép kiểm tra trạng thái hoạt động của Web App
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === "ping") {
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Kết nối Google Apps Script & Google Drive thành công!",
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createHtmlOutput(
    "<div style='font-family: sans-serif; text-align: center; padding: 40px;'>" +
    "<h2 style='color: #1e40af;'>Hệ Thống Giám Sát Công Việc</h2>" +
    "<p style='color: #059669; font-weight: bold;'>✓ Cổng Web App kết nối Google Drive & Sheets đang hoạt động 24/24.</p>" +
    "<p style='color: #64748b;'>Địa chỉ Web App chính thức: <a href='https://gscv246.github.io/baocao/'>https://gscv246.github.io/baocao/</a></p>" +
    "</div>"
  ).setTitle("Hệ Thống Giám Sát Công Việc");
}

/**
 * 2. HÀM TIẾP NHẬN ĐỒNG BỘ DỮ LIỆU TỪ WEB APP GITHUB PAGES (doPost)
 * Nhận request JSON từ https://gscv246.github.io/baocao/
 * Tự động tạo thư mục trên Google Drive, upload ảnh và ghi dòng mới vào Google Sheets
 */
function doPost(e) {
  try {
    ensureDatabaseExists();

    var payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    var action = payload.action || "SYNC_REPORT";

    // A. Kiểm tra kết nối (PING)
    if (action === "PING") {
      var currentEmail = Session.getActiveUser().getEmail() || "Tài khoản Google sở hữu";
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Kết nối tài khoản Google Drive thành công!",
        account: currentEmail,
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // B. Đồng bộ 1 báo cáo (SYNC_REPORT)
    if (action === "SYNC_REPORT") {
      var report = payload.report || payload;
      var result = saveReportToDriveAndSheet(report);
      return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
    }

    // C. Đồng bộ hàng loạt nhiều báo cáo (SYNC_ALL)
    if (action === "SYNC_ALL") {
      var reportsList = payload.reports || [];
      var successCount = 0;
      var errorList = [];

      for (var i = 0; i < reportsList.length; i++) {
        try {
          var res = saveReportToDriveAndSheet(reportsList[i]);
          if (res.status === "success") successCount++;
        } catch (err) {
          errorList.push(err.toString());
        }
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Đã đồng bộ thành công " + successCount + "/" + reportsList.length + " báo cáo lên Google Drive & Sheets!",
        successCount: successCount,
        total: reportsList.length,
        errors: errorList
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Hành động không hợp lệ: " + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Lỗi xử lý máy chủ Google Apps Script: " + error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 3. HÀM LƯU TỪNG BÁO CÁO VÀO GOOGLE DRIVE VÀ GOOGLE SHEETS
 */
function saveReportToDriveAndSheet(report) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    ensureDatabaseExists();
    sheet = ss.getSheetByName(SHEET_NAME);
  }

  var officerName = report.officer_name || report.officerName || "Chưa rõ";
  var customerName = report.customer_name || report.customerName || "";
  var address = report.address || "";
  var startDate = report.start_date || report.startDate || "";
  var startTime = report.start_time || report.startTime || "";
  var endDate = report.end_date || report.endDate || "";
  var endTime = report.end_time || report.endTime || "";
  var taskDescription = report.task_description || report.taskDescription || "";
  var taskResult = report.task_result || report.taskResult || "";
  var status = report.status || "Đạt yêu cầu";
  var lat = report.latitude || "";
  var lng = report.longitude || "";
  var gpsText = (lat && lng) ? (lat + ", " + lng) : "";
  var createdAt = report.created_at || report.recordTime || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");

  // Xử lý tệp hình ảnh: Upload lên Google Drive nếu là Data URL base64
  var imageUrl = report.image_url || report.imageUrl || "";
  var driveFileUrl = imageUrl;

  if (imageUrl && imageUrl.indexOf("data:image") === 0) {
    try {
      var folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
      var parts = imageUrl.split(",");
      var base64Data = parts[1];
      var contentType = parts[0].split(";")[0].split(":")[1] || "image/jpeg";

      var decoded = Utilities.base64Decode(base64Data);
      var blob = Utilities.newBlob(decoded, contentType);

      var safeOfficer = officerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
      var fileName = safeOfficer + "_" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss") + ".jpg";
      blob.setName(fileName);

      var driveFile = folder.createFile(blob);
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      driveFileUrl = driveFile.getUrl();
    } catch (imgErr) {
      console.warn("Lỗi lưu ảnh lên Drive:", imgErr);
    }
  }

  // Ghi hàng dữ liệu mới vào Google Sheets
  var rowData = [
    officerName,      // Cột A: Cán bộ thực hiện
    customerName,     // Cột B: Khách hàng / Công việc
    address,          // Cột C: Địa chỉ thực tế
    startDate,        // Cột D: Ngày bắt đầu
    startTime,        // Cột E: Giờ bắt đầu
    endDate,          // Cột F: Ngày kết thúc
    endTime,          // Cột G: Giờ kết thúc
    taskDescription,  // Cột H: Nội dung công việc
    taskResult,       // Cột I: Kết quả thực hiện
    status,           // Cột J: Đánh giá trạng thái
    driveFileUrl,     // Cột K: Link ảnh trên Google Drive
    gpsText,          // Cột L: Tọa độ GPS hiện trường
    createdAt         // Cột M: Thời gian nộp báo cáo
  ];

  sheet.appendRow(rowData);

  return {
    status: "success",
    message: "Đã lưu vào Google Drive & Google Sheets thành công!",
    driveUrl: driveFileUrl,
    sheetUrl: ss.getUrl()
  };
}

/**
 * 4. TỰ ĐỘNG KHỞI TẠO CƠ SỞ DỮ LIỆU GOOGLE SHEETS
 */
function ensureDatabaseExists() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  var headers = [
    "Cán bộ thực hiện",      // Cột A
    "Khách hàng / Công việc",// Cột B
    "Địa chỉ",               // Cột C
    "Ngày bắt đầu",          // Cột D
    "Giờ bắt đầu",           // Cột E
    "Ngày kết thúc",         // Cột F
    "Giờ kết thúc",          // Cột G
    "Nội dung công việc",    // Cột H
    "Kết quả thực hiện",     // Cột I
    "Đánh giá",              // Cột J
    "Hình ảnh Google Drive", // Cột K
    "Tọa độ GPS",            // Cột L
    "Thời gian nộp"          // Cột M
  ];

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(headers);
    
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1e40af"); // Xanh Navy
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
    
    for (var i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
  } else {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      var range = sheet.getRange(1, 1, 1, headers.length);
      range.setFontWeight("bold");
      range.setBackground("#1e40af");
      range.setFontColor("#ffffff");
      range.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }
  }
}

/**
 * 5. LẤY HOẶC TẠO THƯ MỤC TRÊN GOOGLE DRIVE
 */
function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  var newFolder = DriveApp.createFolder(folderName);
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}
