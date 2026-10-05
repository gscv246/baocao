/**
 * ==============================================================================
 * LOGIC HỆ THỐNG GIÁM SÁT CÔNG VIỆC THẨM ĐỊNH (SERVERLESS CLIENT) - V2.0
 * Bổ sung:
 * 1. Chụp ảnh trực tiếp từ Camera (Bắt buộc, chống chọn ảnh cũ từ máy, đóng dấu Watermark)
 * 2. Dashboard công việc của từng cán bộ (Staff Performance Dashboard)
 * 3. Quản lý tài khoản cán bộ: Thêm mới, Chỉnh sửa, Khóa/Mở, Đổi PIN, Xóa
 * 4. Xóa dữ liệu: Xóa từng mục, Xóa theo checkbox đã chọn, Xóa toàn bộ
 * 5. Reset toàn bộ dữ liệu hệ thống
 * ==============================================================================
 */

// Biến toàn cục
let supabaseClient = null;
let isConfigured = false;
let currentReports = [];
let currentOfficers = [];
let selectedImageFile = null;
let currentGpsLocation = null;
let activeCameraStream = null;
let currentFacingMode = "environment"; // "environment" (camera sau) hoặc "user" (camera trước)

// Khởi chạy khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
  initSystem();
  loadOfficersData();
  setupEventListeners();
  initDateTimeFields();
  checkAdminSession();
});

/**
 * 1. KHỞI TẠO HỆ THỐNG & KẾT NỐI
 */
function initSystem() {
  const statusBadge = document.getElementById("connectionStatusBadge");

  if (APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY && typeof supabase !== "undefined") {
    try {
      supabaseClient = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
      isConfigured = true;
      if (statusBadge) {
        statusBadge.className = "badge bg-success bg-opacity-25 text-success border border-success border-opacity-50 px-3 py-2";
        statusBadge.innerHTML = '<i class="bi bi-cloud-check-fill me-1"></i>Cloud Serverless Active';
      }
    } catch (err) {
      console.error("Lỗi Supabase:", err);
      isConfigured = false;
    }
  }

  if (!isConfigured) {
    if (statusBadge) {
      statusBadge.className = "badge bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50 px-3 py-2";
      statusBadge.innerHTML = '<i class="bi bi-hdd-network me-1"></i>Hệ thống Độc lập (Local Sync)';
    }
    initMockReportsIfEmpty();
  }
}

/**
 * 2. QUẢN LÝ DỮ LIỆU TÀI KHOẢN CÁN BỘ (Load, Save, Populate)
 */
async function loadOfficersData() {
  try {
    if (isConfigured && supabaseClient) {
      const { data, error } = await supabaseClient
        .from("officers")
        .select("*")
        .order("code", { ascending: true });

      if (!error && data && data.length > 0) {
        currentOfficers = data;
      } else {
        currentOfficers = getLocalOfficers();
      }
    } else {
      currentOfficers = getLocalOfficers();
    }
  } catch (e) {
    currentOfficers = getLocalOfficers();
  }

  populateOfficerDropdown();
  if (document.getElementById("officerManagementTableBody")) {
    renderOfficersTable();
  }
}

function getLocalOfficers() {
  const saved = localStorage.getItem("app_officers_list");
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  // Mặc định lấy từ APP_CONFIG
  const initial = APP_CONFIG.INITIAL_OFFICERS.map((o, idx) => ({
    id: idx + 1,
    code: o.code,
    name: o.name,
    phone: o.phone,
    pin: o.pin || "123456",
    status: o.status || "active",
    created_at: new Date().toISOString()
  }));
  localStorage.setItem("app_officers_list", JSON.stringify(initial));
  return initial;
}

function saveLocalOfficers(officers) {
  currentOfficers = officers;
  localStorage.setItem("app_officers_list", JSON.stringify(officers));
  populateOfficerDropdown();
  renderOfficersTable();
}

/**
 * Điền danh sách cán bộ vào các ô chọn (Dropdown)
 */
function populateOfficerDropdown() {
  const officerSelect = document.getElementById("officerName");
  const adminFilterOfficer = document.getElementById("adminFilterOfficer");
  const savedOfficer = localStorage.getItem("last_selected_officer") || "";

  if (officerSelect) {
    officerSelect.innerHTML = '<option value="">-- Chọn cán bộ thẩm định --</option>';
    currentOfficers
      .filter(o => o.status === "active")
      .forEach(o => {
        const opt = document.createElement("option");
        opt.value = `${o.code} - ${o.name}`;
        opt.textContent = `${o.code} - ${o.name}`;
        if (opt.value === savedOfficer) opt.selected = true;
        officerSelect.appendChild(opt);
      });

    officerSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        localStorage.setItem("last_selected_officer", e.target.value);
      }
    });
  }

  if (adminFilterOfficer) {
    const currentFilterVal = adminFilterOfficer.value;
    adminFilterOfficer.innerHTML = '<option value="">-- Tất cả cán bộ --</option>';
    currentOfficers.forEach(o => {
      const opt = document.createElement("option");
      const val = `${o.code} - ${o.name}`;
      opt.value = val;
      opt.textContent = val;
      if (val === currentFilterVal) opt.selected = true;
      adminFilterOfficer.appendChild(opt);
    });
  }
}

/**
 * 3. TÍNH NĂNG CAMERA TRỰC TIẾP (BẮT BUỘC CHỤP ẢNH HIỆN TRƯỜNG)
 */
async function startLiveCamera() {
  const modalEl = document.getElementById("cameraModal");
  const cameraVideo = document.getElementById("cameraVideo");
  const cameraError = document.getElementById("cameraErrorAlert");

  cameraError.classList.add("d-none");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  await openCameraStream(cameraVideo, cameraError);
}

async function openCameraStream(videoEl, errorEl) {
  stopLiveCamera(); // Dừng stream cũ nếu có

  try {
    const constraints = {
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    activeCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = activeCameraStream;
    await videoEl.play();
  } catch (err) {
    console.warn("Không mở được camera trực tiếp qua getUserMedia:", err);
    errorEl.classList.remove("d-none");
    errorEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i>Trình duyệt chặn mở camera trực tiếp (${err.name}). Bạn hãy nhấn nút <strong>"Kích hoạt Camera Hệ Thống"</strong> bên dưới để chụp.`;
  }
}

function switchCamera() {
  currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
  const cameraVideo = document.getElementById("cameraVideo");
  const cameraError = document.getElementById("cameraErrorAlert");
  openCameraStream(cameraVideo, cameraError);
}

function stopLiveCamera() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
}

/**
 * BẤM CHỤP ẢNH TỪ CAMERA & ĐÓNG DẤU WATERMARK CHỐNG GIAN LẬN
 */
function capturePhotoFromCamera() {
  const video = document.getElementById("cameraVideo");
  if (!video || !video.videoWidth) {
    showToast("Camera chưa sẵn sàng, vui lòng đợi giây lát!", "warning");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");

  // Vẽ hình ảnh từ video stream
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // ĐÓNG DẤU THỜI GIAN & TỌA ĐỘ GPS (WATERMARK)
  const now = new Date();
  const timeString = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const officerText = document.getElementById("officerName").value || "Cán bộ thẩm định";
  let watermarkText = `[HIỆN TRƯỜNG THẨM ĐỊNH] ${timeString} | ${officerText}`;
  if (currentGpsLocation) {
    watermarkText += ` | GPS: ${currentGpsLocation.lat.toFixed(5)}, ${currentGpsLocation.lng.toFixed(5)}`;
  }

  // Vẽ dải băng nền bán trong suốt ở đáy ảnh
  const barHeight = Math.max(36, Math.round(canvas.height * 0.06));
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

  // Viết chữ watermark màu vàng - trắng rõ nét
  ctx.fillStyle = "#facc15";
  ctx.font = `bold ${Math.round(barHeight * 0.42)}px 'Be Vietnam Pro', sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(watermarkText, 15, canvas.height - (barHeight / 2));

  // Xuất file ảnh Blob nén nhẹ (khoảng 350KB - 500KB)
  canvas.toBlob((blob) => {
    if (blob) {
      const fileName = `CHUP_THUC_DIA_${Date.now()}.jpg`;
      selectedImageFile = new File([blob], fileName, { type: "image/jpeg", lastModified: Date.now() });

      // Hiển thị ảnh xem trước
      document.getElementById("imagePreview").src = URL.createObjectURL(blob);
      document.getElementById("imagePreviewContainer").classList.remove("d-none");
      document.getElementById("uploadZone").classList.add("d-none");
      document.getElementById("fileInfoText").innerHTML = `<i class="bi bi-camera-fill text-success"></i> Đã chụp trực tiếp (${(blob.size / 1024).toFixed(0)} KB - Có dấu kiểm định)`;

      // Đóng modal camera
      stopLiveCamera();
      const modal = bootstrap.Modal.getInstance(document.getElementById("cameraModal"));
      if (modal) modal.hide();

      showToast("Đã chụp ảnh hiện trường thành công!", "success");
    }
  }, "image/jpeg", 0.82);
}

/**
 * Fallback Camera Trigger & KIỂM TRA CHỐNG CHỌN ẢNH CŨ TỪ THƯ VIỆN
 */
function triggerDirectCameraFallback() {
  const input = document.getElementById("cameraFallbackInput");
  input.click();
}

function handleCameraFallbackChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  // KIỂM TRA THỜI GIAN FILE (CHỐNG CHỌN ẢNH CŨ)
  // Nếu ảnh có thời gian sửa đổi cách hiện tại quá 5 phút -> Chắc chắn là ảnh cũ trong máy
  const now = Date.now();
  const fileAgeMinutes = (now - file.lastModified) / (1000 * 60);

  if (fileAgeMinutes > 5) {
    showToast("CẢNH BÁO: Bạn vừa chọn ảnh cũ từ bộ sưu tập! Hệ thống yêu cầu chụp ảnh trực tiếp tại hiện trường.", "danger");
    removeSelectedImage();
    return;
  }

  // Nén ảnh và nhận
  compressImage(file).then(compressed => {
    selectedImageFile = compressed;
    document.getElementById("imagePreview").src = URL.createObjectURL(compressed);
    document.getElementById("imagePreviewContainer").classList.remove("d-none");
    document.getElementById("uploadZone").classList.add("d-none");
    document.getElementById("fileInfoText").innerHTML = `<i class="bi bi-camera-fill text-success"></i> Ảnh chụp mới (${(compressed.size / 1024).toFixed(0)} KB)`;
    
    // Đóng camera modal nếu đang mở
    const modal = bootstrap.Modal.getInstance(document.getElementById("cameraModal"));
    if (modal) modal.hide();
  });
}

function removeSelectedImage() {
  selectedImageFile = null;
  document.getElementById("cameraFallbackInput").value = "";
  document.getElementById("imagePreview").src = "";
  document.getElementById("imagePreviewContainer").classList.add("d-none");
  document.getElementById("uploadZone").classList.remove("d-none");
}

/**
 * 4. NÉN ẢNH CLIENT-SIDE
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

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
              type: "image/jpeg",
              lastModified: Date.now()
            }));
          } else {
            reject(new Error("Lỗi nén ảnh"));
          }
        }, "image/jpeg", quality);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

/**
 * 5. ĐỊNH VỊ GPS HIỆN TRƯỜNG
 */
function captureGpsLocation() {
  const gpsBtn = document.getElementById("btnGetGps");
  const gpsDisplay = document.getElementById("gpsDisplay");

  if (!navigator.geolocation) {
    showToast("Trình duyệt không hỗ trợ GPS.", "warning");
    return;
  }

  gpsBtn.disabled = true;
  gpsBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Đang lấy GPS...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      gpsBtn.disabled = false;
      gpsBtn.innerHTML = '<i class="bi bi-geo-alt-fill text-danger me-1"></i>Đã lấy tọa độ';
      gpsBtn.className = "btn btn-outline-success btn-sm rounded-pill py-2 px-3";

      currentGpsLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };

      gpsDisplay.innerHTML = `<a href="https://maps.google.com/?q=${currentGpsLocation.lat},${currentGpsLocation.lng}" target="_blank" class="small text-decoration-none text-success fw-semibold">
        <i class="bi bi-pin-map-fill text-danger"></i> ${currentGpsLocation.lat.toFixed(5)}, ${currentGpsLocation.lng.toFixed(5)} (Bản đồ)
      </a>`;
      showToast("Đã ghi nhận tọa độ GPS thực địa!", "success");
    },
    (err) => {
      gpsBtn.disabled = false;
      gpsBtn.innerHTML = '<i class="bi bi-geo-alt me-1"></i>Thử lại GPS';
      showToast("Chưa bật quyền định vị GPS trên điện thoại!", "warning");
    },
    { enableHighAccuracy: true, timeout: 9000 }
  );
}

/**
 * 6. GỬI BÁO CÁO GIÁM SÁT
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

  if (!selectedImageFile) {
    showToast("BẮT BUỘC: Bạn phải bật camera để chụp ảnh minh chứng hiện trường!", "danger");
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

    // Upload lên Supabase Storage nếu có cấu hình
    if (isConfigured && supabaseClient) {
      const cleanOfficer = officerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
      const filePath = `${cleanOfficer}_${Date.now()}.jpg`;

      const { error: upErr } = await supabaseClient.storage.from("report-images").upload(filePath, selectedImageFile);
      if (!upErr) {
        const { data: pUrl } = supabaseClient.storage.from("report-images").getPublicUrl(filePath);
        imageUrl = pUrl.publicUrl;
      }
    }

    if (!imageUrl) {
      imageUrl = await fileToDataUrl(selectedImageFile);
    }

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

    if (isConfigured && supabaseClient) {
      const { error: dbErr } = await supabaseClient.from("reports").insert([reportData]);
      if (dbErr) throw dbErr;
    } else {
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

    currentGpsLocation = null;
    const gpsBtn = document.getElementById("btnGetGps");
    if (gpsBtn) {
      gpsBtn.className = "btn btn-outline-primary btn-sm rounded-pill py-2 px-3";
      gpsBtn.innerHTML = '<i class="bi bi-geo-alt me-1"></i>Lấy vị trí GPS hiện trường';
    }
    const gpsDisplay = document.getElementById("gpsDisplay");
    if (gpsDisplay) gpsDisplay.innerHTML = "";

    // Cập nhật lại admin nếu đang mở
    if (sessionStorage.getItem("admin_authenticated") === "true") {
      loadAdminReports();
    }

  } catch (error) {
    console.error("Lỗi gửi báo cáo:", error);
    showToast("Lỗi gửi báo cáo: " + error.message, "danger");
  } finally {
    btnSubmit.disabled = false;
    btnText.classList.remove("d-none");
    btnSpinner.classList.add("d-none");
  }
}

/**
 * 7. QUẢN TRỊ VIÊN (ADMIN DASHBOARD & AUTHENTICATION)
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
    showToast("Mã PIN không chính xác! (Mặc định: 123456)", "danger");
  }
}

function checkAdminSession() {
  if (sessionStorage.getItem("admin_authenticated") === "true") {
    showAdminDashboard();
  }
}

function showAdminDashboard() {
  const adminSection = document.getElementById("adminViewSection");
  const adminBadge = document.getElementById("adminBadgeIndicator");
  const btnLogin = document.getElementById("btnOpenAdminLogin");

  if (adminSection) adminSection.classList.remove("d-none");
  if (adminBadge) adminBadge.classList.remove("d-none");
  if (btnLogin) btnLogin.classList.add("d-none");

  loadAdminReports();
  renderOfficersTable();
}

function logoutAdmin() {
  sessionStorage.removeItem("admin_authenticated");
  const adminSection = document.getElementById("adminViewSection");
  const adminBadge = document.getElementById("adminBadgeIndicator");
  const btnLogin = document.getElementById("btnOpenAdminLogin");

  if (adminSection) adminSection.classList.add("d-none");
  if (adminBadge) adminBadge.classList.add("d-none");
  if (btnLogin) btnLogin.classList.remove("d-none");

  showToast("Đã đăng xuất quyền Quản trị viên.", "info");
}

/**
 * TẢI DANH SÁCH BÁO CÁO CHO ADMIN
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

      if (!error && data) reports = data;
      else reports = getMockDatabase();
    } else {
      reports = getMockDatabase();
    }

    currentReports = reports;
    updateAdminStatistics(reports);
    renderOfficerPerformanceDashboard(reports);
    renderReportsTable(reports);

    const now = new Date();
    const timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0") + ":" + String(now.getSeconds()).padStart(2, "0");
    const updateEl = document.getElementById("lastUpdatedStatus");
    if (updateEl) updateEl.textContent = `Cập nhật lúc: ${timeStr}`;

  } catch (err) {
    console.error("Lỗi:", err);
  } finally {
    if (btnRefresh) btnRefresh.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
  }
}

/**
 * DASHBOARD THỂ HIỆN CÔNG VIỆC CỦA TỪNG CÁN BỘ (BẢNG HIỆU SUẤT)
 */
function renderOfficerPerformanceDashboard(reports) {
  const tbody = document.getElementById("officerDashboardTableBody");
  if (!tbody) return;

  // Thống kê số lượng hồ sơ theo từng cán bộ
  const statsMap = {};
  currentOfficers.forEach(o => {
    const key = `${o.code} - ${o.name}`;
    statsMap[key] = {
      code: o.code,
      name: o.name,
      total: 0,
      pass: 0,
      pending: 0,
      rejected: 0,
      lastReport: null
    };
  });

  reports.forEach(r => {
    const officerKey = r.officer_name;
    if (!statsMap[officerKey]) {
      statsMap[officerKey] = {
        code: "---",
        name: officerKey,
        total: 0,
        pass: 0,
        pending: 0,
        rejected: 0,
        lastReport: null
      };
    }

    statsMap[officerKey].total++;
    if (r.status === "Đạt yêu cầu") statsMap[officerKey].pass++;
    else if (r.status === "Chờ bổ sung hồ sơ") statsMap[officerKey].pending++;
    else statsMap[officerKey].rejected++;

    if (!statsMap[officerKey].lastReport || new Date(r.created_at) > new Date(statsMap[officerKey].lastReport)) {
      statsMap[officerKey].lastReport = r.created_at;
    }
  });

  const list = Object.values(statsMap).sort((a, b) => b.total - a.total);

  let html = "";
  list.forEach((item, idx) => {
    const rate = item.total > 0 ? Math.round((item.pass / item.total) * 100) : 0;
    const lastTime = item.lastReport ? formatDateVNTime(item.lastReport) : '<span class="text-muted">Chưa có</span>';

    html += `<tr>
      <td class="text-center fw-bold text-muted">${idx + 1}</td>
      <td>
        <span class="badge bg-secondary me-1">${item.code}</span>
        <strong class="text-dark">${escapeHtml(item.name)}</strong>
      </td>
      <td class="text-center fw-bold fs-6 text-primary">${item.total}</td>
      <td class="text-center"><span class="badge bg-success">${item.pass}</span></td>
      <td class="text-center"><span class="badge bg-warning text-dark">${item.pending}</span></td>
      <td class="text-center"><span class="badge bg-danger">${item.rejected}</span></td>
      <td>
        <div class="d-flex align-items-center gap-2">
          <div class="progress flex-grow-1" style="height: 8px;">
            <div class="progress-bar bg-success" style="width: ${rate}%;"></div>
          </div>
          <span class="small fw-semibold">${rate}%</span>
        </div>
      </td>
      <td class="small text-muted">${lastTime}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-primary py-0 px-2" onclick="filterReportsBySpecificOfficer('${escapeHtml(item.code + ' - ' + item.name)}')">
          <i class="bi bi-funnel"></i> Xem
        </button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

function filterReportsBySpecificOfficer(officerKey) {
  const filterSelect = document.getElementById("adminFilterOfficer");
  if (filterSelect) {
    filterSelect.value = officerKey;
    filterSelect.dispatchEvent(new Event("change"));
  }
  // Cuộn xuống bảng danh sách
  document.getElementById("reportsListCard").scrollIntoView({ behavior: "smooth" });
}

/**
 * 8. QUẢN LÝ TÀI KHOẢN CÁN BỘ (ADMIN)
 */
function renderOfficersTable() {
  const tbody = document.getElementById("officerManagementTableBody");
  if (!tbody) return;

  if (currentOfficers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Chưa có cán bộ nào. Bấm "Cấp tài khoản mới" ở trên để thêm.</td></tr>';
    return;
  }

  let html = "";
  currentOfficers.forEach((o, idx) => {
    const isLocked = o.status === "locked";
    const statusBadge = isLocked 
      ? '<span class="badge bg-danger">Bị khóa</span>' 
      : '<span class="badge bg-success">Hoạt động</span>';

    html += `<tr>
      <td class="text-center text-muted fw-bold">${idx + 1}</td>
      <td><span class="badge bg-primary fs-7">${escapeHtml(o.code)}</span></td>
      <td><strong class="text-dark">${escapeHtml(o.name)}</strong></td>
      <td>${escapeHtml(o.phone || '---')}</td>
      <td><code>${escapeHtml(o.pin || '123456')}</code></td>
      <td class="text-center">${statusBadge}</td>
      <td class="text-center">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" onclick="openEditOfficerModal(${o.id})" title="Chỉnh sửa">
            <i class="bi bi-pencil-square"></i>
          </button>
          <button class="btn btn-outline-warning" onclick="toggleLockOfficer(${o.id})" title="${isLocked ? 'Mở khóa' : 'Khóa'}">
            <i class="bi bi-${isLocked ? 'unlock-fill text-success' : 'lock-fill'}"></i>
          </button>
          <button class="btn btn-outline-danger" onclick="deleteOfficerAccount(${o.id})" title="Xóa tài khoản">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

// Mở modal thêm cán bộ
function openAddOfficerModal() {
  document.getElementById("officerModalTitle").textContent = "Cấp Tài Khoản Cán Bộ Mới";
  document.getElementById("officerEditId").value = "";
  document.getElementById("modalOfficerCode").value = `CB${String(currentOfficers.length + 1).padStart(2, '0')}`;
  document.getElementById("modalOfficerName").value = "";
  document.getElementById("modalOfficerPhone").value = "";
  document.getElementById("modalOfficerPin").value = "123456";
  document.getElementById("modalOfficerStatus").value = "active";

  const modal = new bootstrap.Modal(document.getElementById("officerActionModal"));
  modal.show();
}

// Mở modal sửa cán bộ
function openEditOfficerModal(id) {
  const officer = currentOfficers.find(o => o.id === id);
  if (!officer) return;

  document.getElementById("officerModalTitle").textContent = `Chỉnh Sửa Tài Khoản - ${officer.code}`;
  document.getElementById("officerEditId").value = officer.id;
  document.getElementById("modalOfficerCode").value = officer.code;
  document.getElementById("modalOfficerName").value = officer.name;
  document.getElementById("modalOfficerPhone").value = officer.phone || "";
  document.getElementById("modalOfficerPin").value = officer.pin || "123456";
  document.getElementById("modalOfficerStatus").value = officer.status || "active";

  const modal = new bootstrap.Modal(document.getElementById("officerActionModal"));
  modal.show();
}

// Lưu cán bộ (Thêm mới hoặc Cập nhật)
async function handleSaveOfficer(event) {
  event.preventDefault();
  const idStr = document.getElementById("officerEditId").value;
  const code = document.getElementById("modalOfficerCode").value.trim().toUpperCase();
  const name = document.getElementById("modalOfficerName").value.trim();
  const phone = document.getElementById("modalOfficerPhone").value.trim();
  const pin = document.getElementById("modalOfficerPin").value.trim() || "123456";
  const status = document.getElementById("modalOfficerStatus").value;

  if (!code || !name) {
    showToast("Vui lòng điền đầy đủ Mã cán bộ và Họ tên!", "warning");
    return;
  }

  if (idStr) {
    // Cập nhật
    const id = parseInt(idStr);
    const updated = currentOfficers.map(o => {
      if (o.id === id) {
        return { ...o, code, name, phone, pin, status };
      }
      return o;
    });
    saveLocalOfficers(updated);

    if (isConfigured && supabaseClient) {
      await supabaseClient.from("officers").update({ code, name, phone, pin, status }).eq("id", id);
    }
    showToast(`Đã cập nhật thông tin cán bộ ${code}!`, "success");
  } else {
    // Thêm mới
    const newOfficer = {
      id: Date.now(),
      code,
      name,
      phone,
      pin,
      status,
      created_at: new Date().toISOString()
    };
    const updated = [...currentOfficers, newOfficer];
    saveLocalOfficers(updated);

    if (isConfigured && supabaseClient) {
      await supabaseClient.from("officers").insert([{ code, name, phone, pin, status }]);
    }
    showToast(`Đã cấp tài khoản mới cho cán bộ ${code} - ${name}!`, "success");
  }

  const modal = bootstrap.Modal.getInstance(document.getElementById("officerActionModal"));
  if (modal) modal.hide();
}

// Khóa / Mở khóa cán bộ
async function toggleLockOfficer(id) {
  const updated = currentOfficers.map(o => {
    if (o.id === id) {
      const newStatus = (o.status === "locked") ? "active" : "locked";
      return { ...o, status: newStatus };
    }
    return o;
  });
  saveLocalOfficers(updated);

  const target = updated.find(o => o.id === id);
  if (isConfigured && supabaseClient && target) {
    await supabaseClient.from("officers").update({ status: target.status }).eq("id", id);
  }
  showToast(`Đã cập nhật trạng thái tài khoản ${target.code}!`, "info");
}

// Xóa tài khoản cán bộ
async function deleteOfficerAccount(id) {
  const target = currentOfficers.find(o => o.id === id);
  if (!target) return;

  if (!confirm(`Bạn có chắc chắn muốn XÓA tài khoản cán bộ: ${target.code} - ${target.name}?`)) {
    return;
  }

  const updated = currentOfficers.filter(o => o.id !== id);
  saveLocalOfficers(updated);

  if (isConfigured && supabaseClient) {
    await supabaseClient.from("officers").delete().eq("id", id);
  }
  showToast(`Đã xóa tài khoản cán bộ ${target.code}!`, "success");
}

/**
 * 9. TÍNH NĂNG XÓA DỮ LIỆU BÁO CÁO (Từng mục, Theo checkbox, Xóa tất cả, Reset hệ thống)
 */

// Xóa 1 bản ghi
async function deleteSingleReport(id) {
  if (!confirm("Bạn có chắc chắn muốn xóa bản ghi báo cáo này?")) return;

  try {
    if (isConfigured && supabaseClient) {
      await supabaseClient.from("reports").delete().eq("id", id);
    }
    deleteFromMockDatabase([id]);
    showToast("Đã xóa báo cáo thành công!", "success");
    loadAdminReports();
  } catch (err) {
    showToast("Lỗi xóa báo cáo: " + err.message, "danger");
  }
}

// Chọn tất cả checkbox
function toggleSelectAllReports(checkbox) {
  const itemCheckboxes = document.querySelectorAll(".report-select-checkbox");
  itemCheckboxes.forEach(cb => cb.checked = checkbox.checked);
  updateBulkDeleteButtonState();
}

function handleReportItemCheck() {
  updateBulkDeleteButtonState();
}

function updateBulkDeleteButtonState() {
  const checkedBoxes = document.querySelectorAll(".report-select-checkbox:checked");
  const btnBulkDelete = document.getElementById("btnDeleteSelectedReports");
  const countSpan = document.getElementById("selectedDeleteCount");

  if (checkedBoxes.length > 0) {
    btnBulkDelete.classList.remove("d-none");
    countSpan.textContent = checkedBoxes.length;
  } else {
    btnBulkDelete.classList.add("d-none");
  }
}

// XÓA THEO NỘI DUNG CHỌN (BULK DELETE)
async function deleteSelectedReports() {
  const checkedBoxes = document.querySelectorAll(".report-select-checkbox:checked");
  const idsToDelete = Array.from(checkedBoxes).map(cb => {
    const val = cb.value;
    return isNaN(val) ? val : Number(val);
  });

  if (idsToDelete.length === 0) return;

  if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa ${idsToDelete.length} báo cáo đã chọn?`)) {
    return;
  }

  try {
    if (isConfigured && supabaseClient) {
      await supabaseClient.from("reports").delete().in("id", idsToDelete);
    }
    deleteFromMockDatabase(idsToDelete);
    showToast(`Đã xóa thành công ${idsToDelete.length} báo cáo!`, "success");
    document.getElementById("selectAllCheckbox").checked = false;
    updateBulkDeleteButtonState();
    loadAdminReports();
  } catch (err) {
    showToast("Lỗi xóa báo cáo hàng loạt: " + err.message, "danger");
  }
}

// XÓA TOÀN BỘ DỮ LIỆU BÁO CÁO
async function deleteAllReports() {
  const confirmText = prompt("CẢNH BÁO NGUY HIỂM:\nHành động này sẽ XÓA TOÀN BỘ BÁO CÁO trong hệ thống.\nNhập chữ 'XOA HET' vào ô dưới để xác nhận:");
  if (confirmText !== "XOA HET") {
    if (confirmText !== null) showToast("Bạn nhập không đúng chữ 'XOA HET', lệnh xóa bị hủy.", "info");
    return;
  }

  try {
    if (isConfigured && supabaseClient) {
      await supabaseClient.from("reports").delete().neq("id", 0);
    }
    localStorage.removeItem("mock_reports_db");
    showToast("Đã xóa sạch toàn bộ dữ liệu báo cáo!", "success");
    loadAdminReports();
  } catch (err) {
    showToast("Lỗi khi xóa tất cả: " + err.message, "danger");
  }
}

// RESET TOÀN BỘ HỆ THỐNG VỀ CÀI ĐẶT GỐC
function resetSystemToDefault() {
  const confirmText = prompt("CẢNH BÁO KHÔI PHỤC GỐC:\nLệnh này sẽ xóa toàn bộ báo cáo, reset danh sách cán bộ về ban đầu và xóa bộ nhớ cache.\nNhập chữ 'RESET' để tiếp tục:");
  if (confirmText !== "RESET") {
    if (confirmText !== null) showToast("Hủy lệnh Reset hệ thống.", "info");
    return;
  }

  localStorage.clear();
  sessionStorage.clear();
  showToast("Đang khôi phục cài đặt gốc...", "warning");
  setTimeout(() => {
    window.location.reload();
  }, 1200);
}

/**
 * 10. HIỂN THỊ BẢNG DỮ LIỆU & BỘ LỌC
 */
function renderReportsTable(reports) {
  const tbody = document.getElementById("adminTableBody");
  const countEl = document.getElementById("adminRecordCount");
  if (countEl) countEl.textContent = reports.length;

  // Bỏ chọn nút chọn tất cả
  const selectAll = document.getElementById("selectAllCheckbox");
  if (selectAll) selectAll.checked = false;
  updateBulkDeleteButtonState();

  if (!reports || reports.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="10" class="text-center py-5 text-muted">
        <i class="bi bi-inbox fs-2 d-block mb-2"></i>
        Không có dữ liệu báo cáo nào phù hợp.
      </td>
    </tr>`;
    return;
  }

  let html = "";
  reports.forEach((item, index) => {
    let badgeClass = "bg-secondary";
    const found = APP_CONFIG.STATUS_OPTIONS.find(s => s.label === item.status);
    if (found) badgeClass = found.badgeClass;

    let imgThumb = '<span class="text-muted small">Không ảnh</span>';
    if (item.image_url) {
      imgThumb = `<img src="${item.image_url}" class="thumbnail-table shadow-sm" alt="Hình ảnh" 
        onclick="openLightbox('${item.image_url}', '${escapeHtml(item.officer_name)}', '${escapeHtml(item.customer_name || 'Khách hàng')}')">`;
    }

    let gpsLink = "";
    if (item.latitude && item.longitude) {
      gpsLink = `<a href="https://maps.google.com/?q=${item.latitude},${item.longitude}" target="_blank" class="badge bg-light text-primary border" title="Xem trên Google Maps">
        <i class="bi bi-geo-alt text-danger"></i> Tọa độ GPS
      </a>`;
    }

    html += `<tr>
      <td class="text-center">
        <input type="checkbox" class="form-check-input report-select-checkbox" value="${item.id}" onchange="handleReportItemCheck()">
      </td>
      <td class="text-muted fw-bold text-center">${index + 1}</td>
      <td>
        <div class="fw-semibold text-primary">${escapeHtml(item.officer_name)}</div>
        ${gpsLink}
      </td>
      <td>
        <div class="fw-semibold text-dark">${escapeHtml(item.customer_name || 'Khách hàng')}</div>
        <div class="text-muted small text-truncate" style="max-width: 170px;">${escapeHtml(item.address || '')}</div>
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
      <td class="text-center"><span class="badge ${badgeClass}">${escapeHtml(item.status || 'Đạt')}</span></td>
      <td class="text-center">${imgThumb}</td>
      <td class="text-center">
        <button class="btn btn-outline-danger btn-sm p-1" onclick="deleteSingleReport(${typeof item.id === 'string' ? `'${item.id}'` : item.id})" title="Xóa dòng này">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

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
    if (r.status === "Đạt yêu cầu") passCount++;
    if (r.officer_name) officersSet.add(r.officer_name);
  });

  document.getElementById("statTodayReports").textContent = todayCount;
  document.getElementById("statActiveOfficers").textContent = officersSet.size;
  const passRate = total > 0 ? Math.round((passCount / total) * 100) : 0;
  document.getElementById("statPassRate").textContent = `${passRate}%`;
}

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
 * XUẤT CSV
 */
function exportReportsToCSV() {
  if (!currentReports || currentReports.length === 0) {
    showToast("Không có dữ liệu để xuất file!", "warning");
    return;
  }

  const headers = ["STT", "Cán bộ thẩm định", "Khách hàng", "Địa chỉ", "Ngày bắt đầu", "Giờ bắt đầu", "Ngày kết thúc", "Giờ kết thúc", "Nội dung", "Kết quả", "Trạng thái", "Link ảnh", "Thời gian nộp"];
  let csvContent = "\uFEFF";
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
  link.href = URL.createObjectURL(blob);
  link.download = `Bao_Cao_Tham_Dinh_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  showToast("Đã xuất file Excel / CSV thành công!", "success");
}

function openLightbox(imageUrl, officer, customer) {
  document.getElementById("lightboxTitle").innerHTML = `<i class="bi bi-camera-fill me-2 text-warning"></i>${officer} - ${customer}`;
  document.getElementById("lightboxImage").src = imageUrl;
  document.getElementById("lightboxDirectLink").href = imageUrl;
  new bootstrap.Modal(document.getElementById("imageLightboxModal")).show();
}

/**
 * TIỆN ÍCH DỮ LIỆU
 */
function initDateTimeFields() {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const timeStr = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

  const sd = document.getElementById("startDate");
  const ed = document.getElementById("endDate");
  const st = document.getElementById("startTime");
  const et = document.getElementById("endTime");

  if (sd && !sd.value) sd.value = todayStr;
  if (ed && !ed.value) ed.value = todayStr;
  if (st && !st.value) st.value = timeStr;
  if (et && !et.value) et.value = timeStr;
}

function initMockReportsIfEmpty() {
  const existing = localStorage.getItem("mock_reports_db");
  if (!existing) {
    const today = new Date().toISOString().split("T")[0];
    const sample = [
      {
        id: 1,
        officer_name: "CB01 - Nguyễn Văn An",
        customer_name: "Công ty TNHH MTV Ánh Dương",
        address: "128 Nguyễn Trãi, Q.1, TP.HCM",
        start_date: today,
        start_time: "08:30",
        end_date: today,
        end_time: "10:15",
        task_description: "Khảo sát thực địa nhà xưởng sản xuất, đối chiếu giấy phép kinh doanh và máy móc.",
        task_result: "Cơ sở vật chất đang hoạt động bình thường, máy móc đồng bộ, đủ điều kiện phê duyệt.",
        status: "Đạt yêu cầu",
        image_url: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
        latitude: 10.762622,
        longitude: 106.660172,
        created_at: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: 2,
        officer_name: "CB02 - Trần Đình Bảo",
        customer_name: "Hộ kinh doanh Hoàng Yến",
        address: "45 Hoàng Hoa Thám, Ba Đình, Hà Nội",
        start_date: today,
        start_time: "10:00",
        end_date: today,
        end_time: "11:30",
        task_description: "Thẩm định tài sản bảo đảm là bất động sản nhà ở gắn liền với đất.",
        task_result: "Hiện trạng đúng với trích lục bản đồ, không có tranh chấp ranh giới. Chờ bổ sung bản gốc sổ đỏ.",
        status: "Chờ bổ sung hồ sơ",
        image_url: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
        latitude: 21.036237,
        longitude: 105.815347,
        created_at: new Date().toISOString()
      }
    ];
    localStorage.setItem("mock_reports_db", JSON.stringify(sample));
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

function deleteFromMockDatabase(ids) {
  const current = getMockDatabase();
  const idSet = new Set(ids.map(String));
  const remaining = current.filter(r => !idSet.has(String(r.id)));
  localStorage.setItem("mock_reports_db", JSON.stringify(remaining));
}

function fileToDataUrl(file) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.readAsDataURL(file);
  });
}

function formatDateVN(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function formatDateVNTime(isoStr) {
  try {
    const d = new Date(isoStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) { return isoStr; }
}

function showToast(message, type = "primary") {
  const toastEl = document.getElementById("appToast");
  const toastMsg = document.getElementById("appToastMessage");
  if (!toastEl || !toastMsg) return;

  toastEl.className = `toast align-items-center text-white border-0 shadow-lg bg-${type}`;
  toastMsg.innerHTML = message;
  new bootstrap.Toast(toastEl, { delay: 4500 }).show();
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
