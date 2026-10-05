/**
 * ==============================================================================
 * LOGIC HỆ THỐNG GIÁM SÁT CÔNG VIỆC THẨM ĐỊNH (SERVERLESS CLIENT)
 * ==============================================================================
 */

// Biến toàn cục
let supabaseClient = null;
let isConfigured = false;
let currentReports = [];
let selectedImageFile = null;
let currentGpsLocation = null;

// Khởi tạo ứng dụng khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
  initSystem();
  setupEventListeners();
  initDateTimeFields();
  populateOfficerList();
  checkAdminSession();
});

/**
 * 1. KHỞI TẠO HỆ THỐNG & KẾT NỐI SERVERLESS SUPABASE
 */
function initSystem() {
  const statusBadge = document.getElementById("connectionStatusBadge");

  // Kiểm tra xem đã điền SUPABASE_URL và SUPABASE_ANON_KEY chưa
  if (APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY && typeof supabase !== "undefined") {
    try {
      supabaseClient = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
      isConfigured = true;
      if (statusBadge) {
        statusBadge.className = "badge bg-success bg-opacity-25 text-success border border-success border-opacity-50 px-3 py-2";
        statusBadge.innerHTML = '<i class="bi bi-cloud-check-fill me-1"></i>Serverless Cloud Active';
      }
    } catch (err) {
      console.error("Lỗi khởi tạo Supabase:", err);
      isConfigured = false;
    }
  }

  if (!isConfigured) {
    if (statusBadge) {
      statusBadge.className = "badge bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50 px-3 py-2";
      statusBadge.innerHTML = '<i class="bi bi-info-circle-fill me-1"></i>Chế độ Test (LocalStorage)';
    }
    // Nạp dữ liệu mẫu ban đầu nếu LocalStorage rỗng
    initMockDataIfEmpty();
  }
}

/**
 * 2. ĐIỀN DANH SÁCH CÁN BỘ & GHI NHỚ LỰA CHỌN
 */
function populateOfficerList() {
  const officerSelect = document.getElementById("officerName");
  const adminFilterOfficer = document.getElementById("adminFilterOfficer");
  const savedOfficer = localStorage.getItem("last_selected_officer") || "";

  if (officerSelect) {
    officerSelect.innerHTML = '<option value="">-- Chọn cán bộ thẩm định --</option>';
    APP_CONFIG.OFFICERS.forEach(officer => {
      const opt = document.createElement("option");
      opt.value = officer;
      opt.textContent = officer;
      if (officer === savedOfficer) opt.selected = true;
      officerSelect.appendChild(opt);
    });

    officerSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        localStorage.setItem("last_selected_officer", e.target.value);
      }
    });
  }

  if (adminFilterOfficer) {
    adminFilterOfficer.innerHTML = '<option value="">-- Tất cả cán bộ --</option>';
    APP_CONFIG.OFFICERS.forEach(officer => {
      const opt = document.createElement("option");
      opt.value = officer;
      opt.textContent = officer;
      adminFilterOfficer.appendChild(opt);
    });
  }
}

/**
 * 3. TỰ ĐỘNG ĐIỀN NGÀY GIỜ HIỆN TẠI
 */
function initDateTimeFields() {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

  const startDate = document.getElementById("startDate");
  const endDate = document.getElementById("endDate");
  const startTime = document.getElementById("startTime");
  const endTime = document.getElementById("endTime");

  if (startDate && !startDate.value) startDate.value = todayStr;
  if (endDate && !endDate.value) endDate.value = todayStr;
  if (startTime && !startTime.value) startTime.value = timeStr;
  if (endTime && !endTime.value) endTime.value = timeStr;
}

/**
 * 4. TỐI ƯU & NÉN ẢNH TRỰC TIẾP TRÊN TRÌNH DUYỆT (Client-side Compression)
 * Giúp cán bộ tải ảnh 10-15MB xuống còn 300-500KB chỉ trong 1-2 giây trên 4G
 */
function compressImage(file, maxWidth = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              reject(new Error("Lỗi nén ảnh"));
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Xử lý khi chọn hoặc chụp ảnh
 */
async function handleImageSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const previewContainer = document.getElementById("imagePreviewContainer");
  const uploadZone = document.getElementById("uploadZone");
  const previewImg = document.getElementById("imagePreview");
  const fileInfo = document.getElementById("fileInfoText");

  try {
    fileInfo.innerHTML = '<span class="spinner-border spinner-border-sm text-primary"></span> Đang tối ưu nén ảnh...';
    previewContainer.classList.remove("d-none");
    uploadZone.classList.add("d-none");

    // Nén ảnh để tải lên cực nhanh
    const compressed = await compressImage(file);
    selectedImageFile = compressed;

    previewImg.src = URL.createObjectURL(compressed);
    fileInfo.innerHTML = `<i class="bi bi-check-circle-fill text-success"></i> ${file.name} (Đã tối ưu: ${(compressed.size / 1024).toFixed(0)} KB)`;
  } catch (error) {
    console.error("Lỗi nén ảnh:", error);
    selectedImageFile = file;
    previewImg.src = URL.createObjectURL(file);
    fileInfo.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
  }
}

function removeSelectedImage() {
  selectedImageFile = null;
  document.getElementById("imageFileInput").value = "";
  document.getElementById("imagePreview").src = "";
  document.getElementById("imagePreviewContainer").classList.add("d-none");
  document.getElementById("uploadZone").classList.remove("d-none");
}

/**
 * 5. LẤY TỌA ĐỘ GPS HIỆN TẠI (Định vị cán bộ thẩm định)
 */
function captureGpsLocation() {
  const gpsBtn = document.getElementById("btnGetGps");
  const gpsDisplay = document.getElementById("gpsDisplay");

  if (!navigator.geolocation) {
    showToast("Trình duyệt không hỗ trợ lấy định vị GPS.", "warning");
    return;
  }

  gpsBtn.disabled = true;
  gpsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang định vị...';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      gpsBtn.disabled = false;
      gpsBtn.innerHTML = '<i class="bi bi-geo-alt-fill text-danger me-1"></i>Đã lấy tọa độ';
      gpsBtn.classList.remove("btn-outline-primary");
      gpsBtn.classList.add("btn-outline-success");

      currentGpsLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      gpsDisplay.innerHTML = `<a href="https://maps.google.com/?q=${currentGpsLocation.lat},${currentGpsLocation.lng}" target="_blank" class="small text-decoration-none">
        <i class="bi bi-pin-map text-danger"></i> ${currentGpsLocation.lat.toFixed(5)}, ${currentGpsLocation.lng.toFixed(5)} (Xem bản đồ)
      </a>`;
      showToast("Đã lưu tọa độ thực địa thành công!", "success");
    },
    (error) => {
      gpsBtn.disabled = false;
      gpsBtn.innerHTML = '<i class="bi bi-geo-alt me-1"></i>Thử lại GPS';
      showToast("Không thể lấy tọa độ (Vui lòng bật định vị trên điện thoại).", "warning");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/**
 * 6. XỬ LÝ GỬI BÁO CÁO (SUBMIT FORM)
 */
async function handleFormSubmit(event) {
  event.preventDefault();

  const officerName = document.getElementById("officerName").value;
  const customerName = document.getElementById("customerName").value.trim();
  const address = document.getElementById("appraisalAddress").value.trim();
  const startDate = document.getElementById("startDate").value;
  const startTime = document.getElementById("startTime").value;
  const endDate = document.getElementById("endDate").value;
  const endTime = document.getElementById("endTime").value;
  const taskDescription = document.getElementById("taskDescription").value.trim();
  const taskResult = document.getElementById("taskResult").value.trim();
  const status = document.getElementById("appraisalStatus").value;

  if (!officerName) {
    showToast("Vui lòng chọn tên cán bộ thẩm định!", "danger");
    return;
  }

  const btnSubmit = document.getElementById("btnSubmitReport");
  const btnText = document.getElementById("btnSubmitText");
  const btnSpinner = document.getElementById("btnSubmitSpinner");

  btnSubmit.disabled = true;
  btnText.classList.add("d-none");
  btnSpinner.classList.remove("d-none");

  try {
    let imageUrl = "";

    // 1. Tải ảnh lên Supabase Storage (hoặc lưu Base64 trong LocalStorage)
    if (selectedImageFile) {
      if (isConfigured && supabaseClient) {
        // Tên file chuẩn hóa an toàn
        const cleanOfficer = officerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
        const timeKey = Date.now();
        const filePath = `${cleanOfficer}_${timeKey}.jpg`;

        const { data: uploadData, error: uploadError } = await supabaseClient
          .storage
          .from("report-images")
          .upload(filePath, selectedImageFile, {
            cacheControl: "3600",
            upsert: false
          });

        if (uploadError) {
          throw new Error("Lỗi tải ảnh lên Storage: " + uploadError.message);
        }

        // Lấy link xem công khai
        const { data: publicUrlData } = supabaseClient
          .storage
          .from("report-images")
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;
      } else {
        // Chế độ demo: chuyển sang base64 data url
        imageUrl = await fileToDataUrl(selectedImageFile);
      }
    }

    // 2. Chuẩn bị đối tượng báo cáo
    const reportData = {
      officer_name: officerName,
      customer_name: customerName,
      address: address,
      start_date: startDate,
      start_time: startTime,
      end_date: endDate,
      end_time: endTime,
      task_description: taskDescription,
      task_result: taskResult,
      status: status,
      image_url: imageUrl,
      latitude: currentGpsLocation ? currentGpsLocation.lat : null,
      longitude: currentGpsLocation ? currentGpsLocation.lng : null,
      created_at: new Date().toISOString()
    };

    // 3. Ghi vào Database
    if (isConfigured && supabaseClient) {
      const { error: dbError } = await supabaseClient
        .from("reports")
        .insert([reportData]);

      if (dbError) throw new Error("Lỗi lưu cơ sở dữ liệu: " + dbError.message);
    } else {
      // Lưu vào LocalStorage
      saveToMockDatabase(reportData);
    }

    showToast("Đã gửi báo cáo thẩm định thành công!", "success");

    // Reset Form
    document.getElementById("customerName").value = "";
    document.getElementById("appraisalAddress").value = "";
    document.getElementById("taskDescription").value = "";
    document.getElementById("taskResult").value = "";
    removeSelectedImage();
    initDateTimeFields();

    // Reset GPS
    currentGpsLocation = null;
    const gpsBtn = document.getElementById("btnGetGps");
    if (gpsBtn) {
      gpsBtn.className = "btn btn-outline-primary btn-sm rounded-pill";
      gpsBtn.innerHTML = '<i class="bi bi-geo-alt me-1"></i>Lấy vị trí GPS hiện trường';
    }
    const gpsDisplay = document.getElementById("gpsDisplay");
    if (gpsDisplay) gpsDisplay.innerHTML = "";

    // Nếu đang mở Admin view thì cập nhật lại bảng
    if (document.getElementById("adminViewSection") && !document.getElementById("adminViewSection").classList.contains("d-none")) {
      loadAdminReports();
    }

  } catch (error) {
    console.error("Lỗi nộp báo cáo:", error);
    showToast(error.message || "Có lỗi xảy ra khi nộp báo cáo!", "danger");
  } finally {
    btnSubmit.disabled = false;
    btnText.classList.remove("d-none");
    btnSpinner.classList.add("d-none");
  }
}

/**
 * 7. QUẢN LÝ DÀNH CHO ADMIN
 */
function handleAdminLogin(event) {
  event.preventDefault();
  const pin = document.getElementById("adminPinInput").value.trim();

  if (pin === APP_CONFIG.ADMIN_PIN) {
    sessionStorage.setItem("admin_authenticated", "true");
    const modal = bootstrap.Modal.getInstance(document.getElementById("adminLoginModal"));
    if (modal) modal.hide();
    document.getElementById("adminPinInput").value = "";
    showToast("Đăng nhập quyền Quản trị viên thành công!", "success");
    showAdminDashboard();
  } else {
    showToast("Mật mã PIN không chính xác! (Mặc định: 123456)", "danger");
  }
}

function checkAdminSession() {
  if (sessionStorage.getItem("admin_authenticated") === "true") {
    showAdminDashboard();
  }
}

function showAdminDashboard() {
  const adminSection = document.getElementById("adminViewSection");
  const officerSection = document.getElementById("officerSection");
  const adminBadge = document.getElementById("adminBadgeIndicator");

  if (adminSection) adminSection.classList.remove("d-none");
  if (adminBadge) adminBadge.classList.remove("d-none");

  // Cuộn mượt xuống hoặc hiển thị dữ liệu
  loadAdminReports();
}

function logoutAdmin() {
  sessionStorage.removeItem("admin_authenticated");
  const adminSection = document.getElementById("adminViewSection");
  const adminBadge = document.getElementById("adminBadgeIndicator");
  if (adminSection) adminSection.classList.add("d-none");
  if (adminBadge) adminBadge.classList.add("d-none");
  showToast("Đã thoát chế độ Quản trị viên.", "info");
}

/**
 * Tải danh sách báo cáo cho Admin
 */
async function loadAdminReports() {
  const tbody = document.getElementById("adminTableBody");
  const btnRefresh = document.getElementById("btnRefreshData");
  if (btnRefresh) btnRefresh.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  try {
    let reports = [];

    if (isConfigured && supabaseClient) {
      const { data, error } = await supabaseClient
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      reports = data || [];
    } else {
      reports = getMockDatabase();
    }

    currentReports = reports;
    updateAdminStatistics(reports);
    renderReportsTable(reports);

    const now = new Date();
    const timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0");
    const updateEl = document.getElementById("lastUpdatedStatus");
    if (updateEl) updateEl.textContent = `Cập nhật lúc: ${timeStr}`;

  } catch (error) {
    console.error("Lỗi lấy dữ liệu:", error);
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Lỗi: ${error.message}</td></tr>`;
  } finally {
    if (btnRefresh) btnRefresh.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
  }
}

/**
 * Cập nhật các chỉ số thống kê
 */
function updateAdminStatistics(reports) {
  const total = reports.length;
  document.getElementById("statTotalReports").textContent = total;

  const todayStr = new Date().toISOString().split("T")[0];
  let todayCount = 0;
  let passCount = 0;
  const officersSet = new Set();

  reports.forEach(r => {
    if (r.start_date === todayStr || (r.created_at && r.created_at.startsWith(todayStr))) {
      todayCount++;
    }
    if (r.status === "Đạt yêu cầu") {
      passCount++;
    }
    if (r.officer_name) {
      officersSet.add(r.officer_name);
    }
  });

  document.getElementById("statTodayReports").textContent = todayCount;
  document.getElementById("statActiveOfficers").textContent = officersSet.size;

  const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;
  document.getElementById("statPassRate").textContent = `${passRate}%`;
}

/**
 * Hiển thị dữ liệu bảng Admin
 */
function renderReportsTable(reports) {
  const tbody = document.getElementById("adminTableBody");
  const countEl = document.getElementById("adminRecordCount");
  if (countEl) countEl.textContent = reports.length;

  if (!reports || reports.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="9" class="text-center py-5 text-muted">
        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
        Không có dữ liệu báo cáo nào phù hợp với bộ lọc.
      </td>
    </tr>`;
    return;
  }

  let html = "";
  reports.forEach((item, index) => {
    // Trạng thái badge
    let badgeClass = "bg-secondary";
    const foundStatus = APP_CONFIG.STATUS_OPTIONS.find(s => s.label === item.status);
    if (foundStatus) badgeClass = foundStatus.badgeClass;

    // Ảnh thumbnail
    let imgThumb = '<span class="text-muted small">Không ảnh</span>';
    if (item.image_url) {
      imgThumb = `<img src="${item.image_url}" class="thumbnail-table shadow-sm" alt="Hình ảnh" 
        onclick="openLightbox('${item.image_url}', '${escapeHtml(item.officer_name)}', '${escapeHtml(item.customer_name || 'Khách hàng')}')">`;
    }

    // GPS link
    let gpsLink = "";
    if (item.latitude && item.longitude) {
      gpsLink = `<a href="https://maps.google.com/?q=${item.latitude},${item.longitude}" target="_blank" class="badge bg-light text-primary border" title="Xem trên bản đồ">
        <i class="bi bi-geo-alt text-danger"></i> Vị trí
      </a>`;
    }

    // Format ngày giờ
    const formatTime = (iso) => {
      if (!iso) return "";
      try {
        const d = new Date(iso);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      } catch(e) { return iso; }
    };

    html += `<tr>
      <td class="text-muted fw-bold text-center">${index + 1}</td>
      <td>
        <div class="fw-semibold text-primary">${escapeHtml(item.officer_name)}</div>
        ${gpsLink}
      </td>
      <td>
        <div class="fw-semibold text-dark">${escapeHtml(item.customer_name || 'Khách hàng')}</div>
        <div class="text-muted small text-truncate" style="max-width: 180px;">${escapeHtml(item.address || '')}</div>
      </td>
      <td>
        <div class="small fw-semibold">${formatDateVN(item.start_date)}</div>
        <div class="text-muted small">${item.start_time || ''} - ${item.end_time || ''}</div>
      </td>
      <td>
        <div class="text-break" style="max-height: 75px; overflow-y: auto; font-size: 0.85rem;">
          ${escapeHtml(item.task_description)}
        </div>
      </td>
      <td>
        <div class="text-break" style="max-height: 75px; overflow-y: auto; font-size: 0.85rem;">
          ${escapeHtml(item.task_result)}
        </div>
      </td>
      <td class="text-center">
        <span class="badge ${badgeClass}">${escapeHtml(item.status || 'Đạt')}</span>
      </td>
      <td class="text-center">${imgThumb}</td>
      <td>
        <span class="text-muted small">${formatTime(item.created_at)}</span>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

/**
 * 8. BỘ LỌC TÌM KIẾM DỮ LIỆU
 */
function setupEventListeners() {
  const searchInput = document.getElementById("adminSearchInput");
  const filterOfficer = document.getElementById("adminFilterOfficer");
  const filterDate = document.getElementById("adminFilterDate");
  const filterStatus = document.getElementById("adminFilterStatus");
  const btnReset = document.getElementById("btnResetFilter");

  function applyFilters() {
    const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const selectedOfficer = filterOfficer ? filterOfficer.value : "";
    const selectedDate = filterDate ? filterDate.value : "";
    const selectedStatus = filterStatus ? filterStatus.value : "";

    const filtered = currentReports.filter(r => {
      const matchSearch = !q ||
        (r.officer_name && r.officer_name.toLowerCase().includes(q)) ||
        (r.customer_name && r.customer_name.toLowerCase().includes(q)) ||
        (r.address && r.address.toLowerCase().includes(q)) ||
        (r.task_description && r.task_description.toLowerCase().includes(q)) ||
        (r.task_result && r.task_result.toLowerCase().includes(q));

      const matchOfficer = !selectedOfficer || r.officer_name === selectedOfficer;
      const matchDate = !selectedDate || r.start_date === selectedDate;
      const matchStatus = !selectedStatus || r.status === selectedStatus;

      return matchSearch && matchOfficer && matchDate && matchStatus;
    });

    renderReportsTable(filtered);
  }

  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (filterOfficer) filterOfficer.addEventListener("change", applyFilters);
  if (filterDate) filterDate.addEventListener("change", applyFilters);
  if (filterStatus) filterStatus.addEventListener("change", applyFilters);

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (filterOfficer) filterOfficer.value = "";
      if (filterDate) filterDate.value = "";
      if (filterStatus) filterStatus.value = "";
      renderReportsTable(currentReports);
    });
  }
}

/**
 * 9. XUẤT BÁO CÁO EXCEL / CSV (UTF-8 HỖ TRỢ TIẾNG VIỆT)
 */
function exportReportsToCSV() {
  if (!currentReports || currentReports.length === 0) {
    showToast("Không có dữ liệu để xuất file!", "warning");
    return;
  }

  const headers = ["STT", "Cán bộ thẩm định", "Khách hàng", "Địa chỉ", "Ngày bắt đầu", "Giờ bắt đầu", "Ngày kết thúc", "Giờ kết thúc", "Nội dung công việc", "Kết quả thực hiện", "Trạng thái", "Link ảnh", "Thời gian nộp"];
  
  let csvContent = "\uFEFF"; // Thêm BOM UTF-8 để Excel hiển thị tiếng Việt có dấu chuẩn xác
  csvContent += headers.join(",") + "\n";

  currentReports.forEach((r, idx) => {
    const row = [
      idx + 1,
      `"${(r.officer_name || '').replace(/"/g, '""')}"`,
      `"${(r.customer_name || '').replace(/"/g, '""')}"`,
      `"${(r.address || '').replace(/"/g, '""')}"`,
      r.start_date || '',
      r.start_time || '',
      r.end_date || '',
      r.end_time || '',
      `"${(r.task_description || '').replace(/"/g, '""')}"`,
      `"${(r.task_result || '').replace(/"/g, '""')}"`,
      `"${r.status || ''}"`,
      `"${r.image_url || ''}"`,
      `"${r.created_at || ''}"`
    ];
    csvContent += row.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `Bao_Cao_Tham_Dinh_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Đã xuất file báo cáo Excel/CSV thành công!", "success");
}

/**
 * 10. LIGHTBOX XEM ẢNH PHÓNG TO
 */
function openLightbox(imageUrl, officer, customer) {
  const modalImg = document.getElementById("lightboxImage");
  const modalTitle = document.getElementById("lightboxTitle");
  const directLink = document.getElementById("lightboxDirectLink");

  modalTitle.innerHTML = `<i class="bi bi-camera me-2 text-warning"></i>${officer} - ${customer}`;
  modalImg.src = imageUrl;
  directLink.href = imageUrl;

  const modal = new bootstrap.Modal(document.getElementById("imageLightboxModal"));
  modal.show();
}

/**
 * TIỆN ÍCH PHỤ TRỢ (MOCK DATA KHI CHƯA NỐI SUPABASE)
 */
function initMockDataIfEmpty() {
  const existing = localStorage.getItem("mock_reports_db");
  if (!existing) {
    const sampleData = [
      {
        id: 1,
        officer_name: APP_CONFIG.OFFICERS[0] || "Nguyễn Văn An",
        customer_name: "Công ty TNHH MTV Ánh Dương",
        address: "128 Nguyễn Trãi, Q.1, TP.HCM",
        start_date: new Date().toISOString().split("T")[0],
        start_time: "08:30",
        end_date: new Date().toISOString().split("T")[0],
        end_time: "10:15",
        task_description: "Khảo sát thực địa nhà xưởng sản xuất, đối chiếu giấy phép kinh doanh và hiện trạng máy móc.",
        task_result: "Cơ sở vật chất đang hoạt động bình thường, máy móc đồng bộ, đủ điều kiện phê duyệt khoản vay.",
        status: "Đạt yêu cầu",
        image_url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
        latitude: 10.762622,
        longitude: 106.660172,
        created_at: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 2,
        officer_name: APP_CONFIG.OFFICERS[1] || "Trần Đình Bảo",
        customer_name: "Hộ kinh doanh Hoàng Yến",
        address: "45 Hoàng Hoa Thám, Ba Đình, Hà Nội",
        start_date: new Date().toISOString().split("T")[0],
        start_time: "10:00",
        end_date: new Date().toISOString().split("T")[0],
        end_time: "11:30",
        task_description: "Thẩm định tài sản bảo đảm là bất động sản nhà ở gắn liền với đất.",
        task_result: "Hiện trạng đúng với trích lục bản đồ, không có tranh chấp ranh giới. Khách hàng cam kết bổ sung bản gốc sổ đỏ trước 17h.",
        status: "Chờ bổ sung hồ sơ",
        image_url: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
        latitude: 21.036237,
        longitude: 105.815347,
        created_at: new Date().toISOString()
      }
    ];
    localStorage.setItem("mock_reports_db", JSON.stringify(sampleData));
  }
}

function getMockDatabase() {
  const raw = localStorage.getItem("mock_reports_db");
  return raw ? JSON.parse(raw) : [];
}

function saveToMockDatabase(report) {
  const current = getMockDatabase();
  report.id = Date.now();
  current.unshift(report);
  localStorage.setItem("mock_reports_db", JSON.stringify(current));
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function formatDateVN(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function showToast(message, type = "primary") {
  const toastEl = document.getElementById("appToast");
  const toastMsg = document.getElementById("appToastMessage");
  if (!toastEl || !toastMsg) return;

  toastEl.className = `toast align-items-center text-white border-0 shadow-lg bg-${type}`;
  toastMsg.innerHTML = message;

  const toast = new bootstrap.Toast(toastEl, { delay: 4500 });
  toast.show();
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
