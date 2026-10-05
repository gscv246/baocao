/**
 * ==============================================================================
 * HỆ THỐNG GIÁM SÁT CÔNG VIỆC CÁN BỘ THẨM ĐỊNH HIỆN TRƯỜNG
 * Nền tảng: Google Apps Script + Google Sheets + Google Drive
 * Tác giả: Senior Full-stack Developer
 * ==============================================================================
 */

// ------------------------------------------------------------------------------
// CẤU HÌNH HỆ THỐNG
// ------------------------------------------------------------------------------
// Đổi email này thành email Google của Admin / Trưởng nhóm quản lý
const ADMIN_EMAIL = "admin@example.com"; 

// Tên trang tính lưu trữ cơ sở dữ liệu
const SHEET_NAME = "Du_Lieu_Tong";

// Tên thư mục lưu trữ ảnh chụp trên Google Drive
const DRIVE_FOLDER_NAME = "Hinh_Anh_Giam_Sat_Tham_Dinh";

/**
 * 1. HÀM KHỞI CHẠY WEB APP (doGet)
 * Nhận request từ trình duyệt, kiểm tra quyền email và trả về giao diện tương ứng
 */
function doGet(e) {
  try {
    // Tự động kiểm tra và khởi tạo bảng dữ liệu nếu chưa có
    ensureDatabaseExists();

    // Lấy email của người dùng đang đăng nhập
    var userEmail = Session.getActiveUser().getEmail() || "";
    
    // Kiểm tra xem người dùng hiện tại có phải là Admin hay không
    var isAdmin = false;
    if (userEmail && ADMIN_EMAIL) {
      isAdmin = (userEmail.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase());
    }

    // Nạp tệp giao diện HTML và truyền biến sang Frontend
    var template = HtmlService.createTemplateFromFile("index");
    template.userEmail = userEmail;
    template.isAdmin = isAdmin;
    template.adminEmail = ADMIN_EMAIL;

    // Render HTML với các cài đặt chuẩn cho thiết bị di động
    return template.evaluate()
      .setTitle("Hệ Thống Giám Sát Công Việc Thẩm Định")
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService.createHtmlOutput("<h3 style='color:red;'>Lỗi khởi động hệ thống: " + error.toString() + "</h3>");
  }
}

/**
 * 2. TỰ ĐỘNG KHỞI TẠO CƠ SỞ DỮ LIỆU GOOGLE SHEETS
 * Đảm bảo Sheet 'Du_Lieu_Tong' luôn tồn tại với đầy đủ các cột A -> H
 */
function ensureDatabaseExists() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  // Danh sách các cột theo đúng yêu cầu nghiệp vụ
  var headers = [
    "Tên cán bộ",        // Cột A
    "Ngày thực hiện",    // Cột B
    "Giờ thực hiện",     // Cột C
    "Ngày kết thúc",     // Cột D
    "Giờ kết thúc",      // Cột E
    "Công việc thực hiện",// Cột F
    "Kết quả thực hiện", // Cột G
    "Hình ảnh đính kèm", // Cột H
    "Thời gian ghi nhận" // Cột I (Metadata bổ sung để sắp xếp/kiểm toán)
  ];

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Ghi tiêu đề cột
    sheet.appendRow(headers);
    
    // Định dạng dòng tiêu đề: In đậm, nền xanh chuyên nghiệp, căn giữa
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#1e3a8a"); // Xanh Navy
    headerRange.setFontColor("#ffffff");
    headerRange.setHorizontalAlignment("center");
    sheet.setFrozenRows(1); // Cố định dòng tiêu đề
    
    // Tự động điều chỉnh độ rộng cột
    for (var i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
  } else {
    // Nếu sheet đã có nhưng hàng 1 rỗng thì tạo header
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      var range = sheet.getRange(1, 1, 1, headers.length);
      range.setFontWeight("bold");
      range.setBackground("#1e3a8a");
      range.setFontColor("#ffffff");
      range.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }
  }
}

/**
 * HÀM PHỤ TRỢ: LẤY HOẶC TẠO THƯ MỤC TRÊN GOOGLE DRIVE
 */
function getOrCreateFolder(folderName) {
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  // Tạo thư mục mới nếu chưa tồn tại
  var newFolder = DriveApp.createFolder(folderName);
  // Cài đặt chia sẻ: Bất kỳ ai có đường link đều có thể xem ảnh
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}

/**
 * 3. HÀM XỬ LÝ NHẬN FORM TỪ CÁN BỘ (processForm)
 * Nhận form data, upload ảnh lên Google Drive và ghi dữ liệu vào Google Sheets
 */
function processForm(formObject) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      ensureDatabaseExists();
      sheet = ss.getSheetByName(SHEET_NAME);
    }

    // 1. Trích xuất thông tin văn bản từ Form
    var officerName = formObject.officerName ? formObject.officerName.trim() : "Chưa xác định";
    var startDate = formObject.startDate || "";
    var startTime = formObject.startTime || "";
    var endDate = formObject.endDate || "";
    var endTime = formObject.endTime || "";
    var taskDescription = formObject.taskDescription ? formObject.taskDescription.trim() : "";
    var taskResult = formObject.taskResult ? formObject.taskResult.trim() : "";

    // 2. Xử lý tệp hình ảnh đính kèm
    var imageUrl = "Không có ảnh";
    var fileId = "";
    
    if (formObject.imageFile && formObject.imageFile.length > 0) {
      var folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
      var imageBlob = formObject.imageFile;

      // Chuẩn hóa tên cán bộ thành không dấu để đặt tên file an toàn
      var safeOfficerName = officerName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "_");

      // Định dạng thời gian tạo file: YYYYMMDD_HHmmss
      var now = new Date();
      var timeStampStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
      
      // Lấy đuôi file gốc (vd: .jpg, .png)
      var originalFileName = imageBlob.getName() || "photo.jpg";
      var ext = "";
      var dotIndex = originalFileName.lastIndexOf(".");
      if (dotIndex !== -1) {
        ext = originalFileName.substring(dotIndex);
      } else {
        ext = ".jpg";
      }

      // Quy chuẩn tên file: [TênCánBộ]_[ThờiGian]_[TênGốc]
      var newFileName = safeOfficerName + "_" + timeStampStr + ext;
      
      // Tạo file trên Google Drive
      var driveFile = folder.createFile(imageBlob);
      driveFile.setName(newFileName);
      
      // Mở quyền xem cho bất kỳ ai có link để hiển thị trực tiếp trên giao diện Admin
      driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      fileId = driveFile.getId();
      // Link xem trực tiếp hoặc tải
      imageUrl = driveFile.getUrl();
    }

    // 3. Ghi dòng dữ liệu mới vào Google Sheets
    var recordTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
    var rowData = [
      officerName,      // Cột A
      startDate,        // Cột B
      startTime,        // Cột C
      endDate,          // Cột D
      endTime,          // Cột E
      taskDescription,  // Cột F
      taskResult,       // Cột G
      imageUrl,         // Cột H
      recordTime        // Cột I
    ];

    sheet.appendRow(rowData);

    return {
      status: "success",
      message: "Đã gửi báo cáo giám sát thành công!",
      officer: officerName,
      imageUrl: imageUrl
    };

  } catch (error) {
    return {
      status: "error",
      message: "Lỗi hệ thống khi lưu báo cáo: " + error.toString()
    };
  }
}

/**
 * 4. HÀM LẤY TOÀN BỘ DỮ LIỆU CHO PHÍA ADMIN (getAdminData)
 * Đọc tất cả báo cáo từ Sheet và chuẩn hóa dữ liệu trả về cho giao diện Admin
 */
function getAdminData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return { status: "success", data: [] };
    }

    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return { status: "success", data: [] }; // Chỉ có dòng tiêu đề hoặc rỗng
    }

    // Lấy toàn bộ dữ liệu từ hàng 2 đến hết
    var range = sheet.getRange(2, 1, lastRow - 1, 9);
    var values = range.getValues();
    var reports = [];

    // Duyệt ngược từ dòng mới nhất lên dòng cũ nhất
    for (var i = values.length - 1; i >= 0; i--) {
      var row = values[i];
      var rawImgUrl = row[7] ? String(row[7]) : "";
      var fileId = "";
      
      // Trích xuất File ID từ Drive URL để tạo thumbnail hiển thị mượt mà
      var matchId = rawImgUrl.match(/[-\w]{25,}/);
      if (matchId) {
        fileId = matchId[0];
      }

      // Xử lý định dạng ngày tháng hiển thị
      var formatDisplayDate = function(val) {
        if (val instanceof Date) {
          return Utilities.formatDate(val, Session.getScriptTimeZone(), "dd/MM/yyyy");
        }
        return val ? String(val) : "";
      };

      var formatDisplayTime = function(val) {
        if (val instanceof Date) {
          return Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
        }
        return val ? String(val) : "";
      };

      reports.push({
        id: (values.length - i),
        officerName: row[0] ? String(row[0]) : "Chưa rõ",
        startDate: formatDisplayDate(row[1]),
        startTime: formatDisplayTime(row[2]),
        endDate: formatDisplayDate(row[3]),
        endTime: formatDisplayTime(row[4]),
        taskDescription: row[5] ? String(row[5]) : "",
        taskResult: row[6] ? String(row[6]) : "",
        imageUrl: rawImgUrl,
        fileId: fileId,
        thumbnailUrl: fileId ? "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w300" : "",
        recordTime: row[8] instanceof Date ? Utilities.formatDate(row[8], Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss") : String(row[8] || "")
      });
    }

    return {
      status: "success",
      total: reports.length,
      data: reports
    };

  } catch (error) {
    return {
      status: "error",
      message: "Không thể lấy dữ liệu quản trị: " + error.toString(),
      data: []
    };
  }
}
