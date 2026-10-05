/**
 * ==============================================================================
 * LOGIC HỆ THỐNG GIÁM SÁT CÔNG VIỆC (SERVERLESS REALTIME 24/24) - V4.0
 * Các tính năng chính:
 * 1. Tự động gán Tên tài khoản, Ngày giờ chụp và Tọa độ GPS trực tiếp vào ảnh khi mở camera
 * 2. Hiển thị HUD Live (Tài khoản, Đồng hồ đếm giây, Tọa độ GPS) ngay trên khung ngắm Camera
 * 3. Đổi tên thương hiệu chuẩn mực thành "GIÁM SÁT CÔNG VIỆC"
 * 4. Đồng bộ Realtime 24/24 đa thiết bị qua WebSocket MQTT
 * 5. Bảng ghi nhận báo cáo nằm ngay phía dưới form, xếp ngày giờ mới nhất lên đầu
 * 6. Quản trị viên cấp & chỉnh sửa tài khoản, xóa dữ liệu và reset hệ thống
 * ==============================================================================
 */

// Biến toàn cục
let supabaseClient = null;
let mqttClient = null;
let isConfigured = false;
let currentReports = [];
let currentOfficers = [];
let selectedImageFile = null;
let currentGpsLocation = null;
let activeCameraStream = null;
let currentFacingMode = "environment";
let filterOnlyMyReports = false;
let cameraClockInterval = null;

// Khởi chạy khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
  initSystem();
  loadOfficersData();
  initDateTimeFields();
  setupEventListeners();
  checkAdminSession();
  initRealtimeWebSocket();
  // Tự động xin quyền và lấy GPS sẵn ngay khi mở trang web
  fetchGpsAutomatically(false);
});

/**
 * 1. KHỞI TẠO HỆ THỐNG & KẾT NỐI REALTIME WEBSOCKET 24/24
 */
function initSystem() {
  if (APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY && typeof supabase !== "undefined") {
    try {
      supabaseClient = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
      isConfigured = true;
    } catch (err) {
      console.warn("Lỗi Supabase:", err);
      isConfigured = false;
    }
  }

  currentReports = getLocalReports();
  renderAllTables();
}

/**
 * KẾT NỐI WEBSOCKET MQTT REALTIME 24/24 ĐỒNG BỘ ĐA THIẾT BỊ
 */
function initRealtimeWebSocket() {
  const statusBadge = document.getElementById("connectionStatusBadge");

  if (typeof mqtt === "undefined") {
    console.warn("Thư viện MQTT chưa nạp.");
    return;
  }

  try {
    const clientId = "gscv246_" + Math.random().toString(36).substring(2, 10);
    mqttClient = mqtt.connect(APP_CONFIG.REALTIME_BROKER, {
      clientId: clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 2500,
      keepalive: 60
    });

    mqttClient.on("connect", () => {
      console.log("Đã kết nối Realtime WebSocket 24/24 thành công!");
      if (statusBadge) {
        statusBadge.className = "badge bg-success bg-opacity-25 text-success border border-success border-opacity-50 px-3 py-2";
        statusBadge.innerHTML = '<span class="spinner-grow spinner-grow-sm text-success me-1"></span>Realtime 24/24 Online';
      }

      mqttClient.subscribe(APP_CONFIG.REALTIME_TOPIC, { qos: 1 });
      mqttClient.subscribe(APP_CONFIG.REALTIME_TOPIC + "/action", { qos: 1 });
      mqttClient.subscribe(APP_CONFIG.REALTIME_TOPIC + "/sync_req", { qos: 1 });
      mqttClient.subscribe(APP_CONFIG.REALTIME_TOPIC + "/sync_res", { qos: 1 });

      publishRealtimeMessage(APP_CONFIG.REALTIME_TOPIC + "/sync_req", { reqClientId: clientId });
    });

    mqttClient.on("message", (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        handleIncomingRealtimeMessage(topic, payload);
      } catch (e) {
        console.error("Lỗi đọc gói tin Realtime:", e);
      }
    });

    mqttClient.on("offline", () => {
      if (statusBadge) {
        statusBadge.className = "badge bg-warning bg-opacity-25 text-warning border border-warning border-opacity-50 px-3 py-2";
        statusBadge.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Đang kết nối lại Realtime...';
      }
    });

    mqttClient.on("error", (err) => {
      console.warn("Lỗi kết nối MQTT:", err);
    });

  } catch (err) {
    console.error("Không thể khởi tạo MQTT:", err);
  }
}

function handleIncomingRealtimeMessage(topic, payload) {
  if (topic === APP_CONFIG.REALTIME_TOPIC) {
    if (payload && payload.type === "NEW_REPORT" && payload.data) {
      const newReport = payload.data;
      const exists = currentReports.some(r => String(r.id) === String(newReport.id));
      if (!exists) {
        currentReports.unshift(newReport);
        sortReportsByDateTime();
        saveLocalReports(currentReports);
        renderAllTables(newReport.id);

        showToast(`🔔 Cán bộ <strong>${escapeHtml(newReport.officer_name)}</strong> vừa nộp báo cáo lúc ${formatTimeOnly(newReport.created_at)}!`, "info");
      }
    }
  } 
  else if (topic === APP_CONFIG.REALTIME_TOPIC + "/action") {
    if (payload.type === "DELETE_REPORTS" && payload.ids) {
      const delSet = new Set(payload.ids.map(String));
      currentReports = currentReports.filter(r => !delSet.has(String(r.id)));
      saveLocalReports(currentReports);
      renderAllTables();
    } else if (payload.type === "RESET_SYSTEM") {
      currentReports = [];
      saveLocalReports(currentReports);
      renderAllTables();
      showToast("Quản trị viên đã thực hiện Reset hệ thống.", "warning");
    } else if (payload.type === "UPDATE_OFFICERS" && payload.officers) {
      currentOfficers = payload.officers;
      localStorage.setItem("app_officers_list", JSON.stringify(currentOfficers));
      populateOfficerDropdown();
      renderOfficersTable();
    }
  }
  else if (topic === APP_CONFIG.REALTIME_TOPIC + "/sync_req") {
    if (currentReports.length > 0) {
      publishRealtimeMessage(APP_CONFIG.REALTIME_TOPIC + "/sync_res", {
        reports: currentReports,
        officers: currentOfficers
      });
    }
  }
  else if (topic === APP_CONFIG.REALTIME_TOPIC + "/sync_res") {
    if (payload.reports && Array.isArray(payload.reports)) {
      mergeReportsData(payload.reports);
    }
    if (payload.officers && Array.isArray(payload.officers)) {
      mergeOfficersData(payload.officers);
    }
  }
}

function publishRealtimeMessage(topic, dataObj) {
  if (mqttClient && mqttClient.connected) {
    mqttClient.publish(topic, JSON.stringify(dataObj), { qos: 1 });
  }
}

function mergeReportsData(incomingReports) {
  let hasChange = false;
  const map = new Map();
  currentReports.forEach(r => map.set(String(r.id), r));

  incomingReports.forEach(r => {
    if (!map.has(String(r.id))) {
      map.set(String(r.id), r);
      hasChange = true;
    }
  });

  if (hasChange) {
    currentReports = Array.from(map.values());
    sortReportsByDateTime();
    saveLocalReports(currentReports);
    renderAllTables();
  }
}

function mergeOfficersData(incomingOfficers) {
  if (incomingOfficers && incomingOfficers.length >= currentOfficers.length) {
    currentOfficers = incomingOfficers;
    localStorage.setItem("app_officers_list", JSON.stringify(currentOfficers));
    populateOfficerDropdown();
    renderOfficersTable();
  }
}

function sortReportsByDateTime() {
  currentReports.sort((a, b) => {
    const timeA = new Date(a.created_at || (a.start_date + "T" + (a.start_time || "00:00"))).getTime();
    const timeB = new Date(b.created_at || (b.start_date + "T" + (b.start_time || "00:00"))).getTime();
    return timeB - timeA;
  });
}

/**
 * 2. QUẢN LÝ DỮ LIỆU TÀI KHOẢN CÁN BỘ
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
  renderOfficersTable();
}

function getLocalOfficers() {
  const saved = localStorage.getItem("app_officers_list");
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
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
  publishRealtimeMessage(APP_CONFIG.REALTIME_TOPIC + "/action", {
    type: "UPDATE_OFFICERS",
    officers: currentOfficers
  });
}

function populateOfficerDropdown() {
  const officerSelect = document.getElementById("officerName");
  const adminFilterOfficer = document.getElementById("adminFilterOfficer");
  const savedOfficer = localStorage.getItem("last_selected_officer") || "";

  if (officerSelect) {
    officerSelect.innerHTML = '<option value="">-- Chọn cán bộ thực hiện --</option>';
    currentOfficers
      .filter(o => o.status === "active")
      .forEach(o => {
        const opt = document.createElement("option");
        opt.value = `${o.code} - ${o.name}`;
        opt.textContent = `${o.code} - ${o.name}`;
        if (opt.value === savedOfficer) opt.selected = true;
        officerSelect.appendChild(opt);
      });

    // Nếu chưa chọn ai, tự động chọn người đầu tiên
    if (!officerSelect.value && officerSelect.options.length > 1) {
      officerSelect.selectedIndex = 1;
      localStorage.setItem("last_selected_officer", officerSelect.value);
    }

    officerSelect.addEventListener("change", (e) => {
      if (e.target.value) {
        localStorage.setItem("last_selected_officer", e.target.value);
        if (filterOnlyMyReports) {
          applyPublicStaffFilter();
        }
        updateCameraHudInfo();
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
 * 3. TÍNH NĂNG TỰ ĐỘNG GÁN TÀI KHOẢN, NGÀY GIỜ VÀ VỊ TRÍ KHI MỞ CAMERA
 */

// Tự động lấy vị trí GPS trong background
function fetchGpsAutomatically(showNotification = true) {
  if (!navigator.geolocation) {
    updateCameraHudGpsText("Thiết bị không hỗ trợ GPS");
    return;
  }

  updateCameraHudGpsText("Đang định vị GPS...");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentGpsLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };

      const gpsCoordsText = `${currentGpsLocation.lat.toFixed(5)}, ${currentGpsLocation.lng.toFixed(5)}`;
      updateCameraHudGpsText(`GPS: ${gpsCoordsText}`);

      // Cập nhật giao diện ngoài form
      const gpsBtn = document.getElementById("btnGetGps");
      const gpsDisplay = document.getElementById("gpsDisplay");
      if (gpsBtn) {
        gpsBtn.className = "btn btn-outline-success btn-sm rounded-pill py-2 px-3";
        gpsBtn.innerHTML = '<i class="bi bi-geo-alt-fill text-danger me-1"></i>Đã gán vị trí';
      }
      if (gpsDisplay) {
        gpsDisplay.innerHTML = `<a href="https://maps.google.com/?q=${currentGpsLocation.lat},${currentGpsLocation.lng}" target="_blank" class="small text-decoration-none text-success fw-semibold">
          <i class="bi bi-pin-map-fill text-danger"></i> ${gpsCoordsText} (Xem bản đồ)
        </a>`;
      }

      if (showNotification) {
        showToast(`📍 Đã tự động gán tọa độ GPS: ${gpsCoordsText}`, "success");
      }
    },
    (err) => {
      console.warn("GPS error:", err);
      updateCameraHudGpsText("Chưa bật quyền định vị");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function updateCameraHudInfo() {
  const officerSelect = document.getElementById("officerName");
  const officerName = officerSelect?.value || localStorage.getItem("last_selected_officer") || "Cán bộ công việc";
  const hudOfficer = document.getElementById("hudOfficerName");
  if (hudOfficer) hudOfficer.textContent = officerName;

  updateCameraHudClock();
}

function updateCameraHudClock() {
  const hudClock = document.getElementById("hudLiveClock");
  if (hudClock) {
    const now = new Date();
    hudClock.textContent = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }
}

function updateCameraHudGpsText(text) {
  const hudGps = document.getElementById("hudGpsLocation");
  if (hudGps) hudGps.textContent = text;
}

/**
 * KHI MỞ CAMERA: TỰ ĐỘNG GÁN TÀI KHOẢN, BẮT ĐẦU ĐỒNG HỒ & LẤY TỌA ĐỘ GPS NGAY LẬP TỨC
 */
async function startLiveCamera() {
  // 1. Tự động kiểm tra và gán tài khoản chụp
  const officerSelect = document.getElementById("officerName");
  if (!officerSelect.value && officerSelect.options.length > 1) {
    officerSelect.selectedIndex = 1;
    localStorage.setItem("last_selected_officer", officerSelect.value);
  }

  // 2. Tự động lấy vị trí GPS ngay lập tức
  fetchGpsAutomatically(false);

  // 3. Khởi động đồng hồ đếm giây trên khung ngắm Camera
  updateCameraHudInfo();
  if (cameraClockInterval) clearInterval(cameraClockInterval);
  cameraClockInterval = setInterval(updateCameraHudClock, 1000);

  const modalEl = document.getElementById("cameraModal");
  const cameraVideo = document.getElementById("cameraVideo");
  const cameraError = document.getElementById("cameraErrorAlert");

  cameraError.classList.add("d-none");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();

  await openCameraStream(cameraVideo, cameraError);
}

async function openCameraStream(videoEl, errorEl) {
  stopLiveCameraStreamOnly();

  try {
    const constraints = {
      video: {
        facingMode: { ideal: currentFacingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    activeCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = activeCameraStream;
    await videoEl.play();
  } catch (err) {
    console.warn("Lỗi camera stream:", err);
    errorEl.classList.remove("d-none");
    errorEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i>Trình duyệt chặn mở camera trực tiếp. Bạn hãy bấm nút <strong>"Camera Hệ Thống"</strong> bên dưới.`;
  }
}

function switchCamera() {
  currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
  const cameraVideo = document.getElementById("cameraVideo");
  const cameraError = document.getElementById("cameraErrorAlert");
  openCameraStream(cameraVideo, cameraError);
}

function stopLiveCameraStreamOnly() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
}

function stopLiveCamera() {
  stopLiveCameraStreamOnly();
  if (cameraClockInterval) {
    clearInterval(cameraClockInterval);
    cameraClockInterval = null;
  }
}

/**
 * ĐÓNG DẤU WATERMARK CHUYÊN NGHIỆP: TÀI KHOẢN + NGÀY GIỜ + TỌA ĐỘ GPS
 */
function applyWatermarkToCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const now = new Date();
  const timeString = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  
  const officerSelect = document.getElementById("officerName");
  const officerText = officerSelect?.value || localStorage.getItem("last_selected_officer") || "Cán bộ công việc";
  
  let gpsText = "Tọa độ: Đang bật định vị thiết bị";
  if (currentGpsLocation) {
    gpsText = `GPS: ${currentGpsLocation.lat.toFixed(5)}, ${currentGpsLocation.lng.toFixed(5)}`;
  }

  // Chiều cao dải băng Watermark tương thích với kích thước ảnh
  const bannerHeight = Math.max(70, Math.round(canvas.height * 0.12));
  
  // Vẽ dải băng nền tối mờ
  ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
  ctx.fillRect(0, canvas.height - bannerHeight, canvas.width, bannerHeight);

  // Đường viền ngăn cách màu xanh
  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = Math.max(2, Math.round(canvas.height * 0.004));
  ctx.beginPath();
  ctx.moveTo(0, canvas.height - bannerHeight);
  ctx.lineTo(canvas.width, canvas.height - bannerHeight);
  ctx.stroke();

  // Kích thước chữ tỷ lệ theo khung hình
  const fontSizeHeader = Math.max(13, Math.round(bannerHeight * 0.24));
  const fontSizeContent = Math.max(12, Math.round(bannerHeight * 0.22));

  // Dòng 1: Tiêu đề hệ thống (Màu vàng rực rỡ)
  ctx.fillStyle = "#facc15";
  ctx.font = `bold ${fontSizeHeader}px 'Be Vietnam Pro', sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText("GIÁM SÁT CÔNG VIỆC - ẢNH HIỆN TRƯỜNG THỰC TẾ", 18, canvas.height - bannerHeight + 10);

  // Dòng 2: Tên tài khoản & Ngày giờ chụp (Màu trắng)
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${fontSizeContent}px 'Be Vietnam Pro', sans-serif`;
  ctx.fillText(`Tài khoản chụp: ${officerText}  |  Thời gian: ${timeString}`, 18, canvas.height - bannerHeight + 10 + fontSizeHeader + 6);

  // Dòng 3: Tọa độ GPS thực địa (Màu xanh Cyan)
  ctx.fillStyle = "#38bdf8";
  ctx.font = `500 ${fontSizeContent}px 'Be Vietnam Pro', sans-serif`;
  ctx.fillText(`Vị trí: ${gpsText} (Xác thực hiện trường)`, 18, canvas.height - bannerHeight + 10 + fontSizeHeader + fontSizeContent + 12);
}

/**
 * BẤM CHỤP ẢNH TỪ CAMERA TRỰC TIẾP
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

  // Vẽ khung hình video
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // ĐÓNG DẤU TỰ ĐỘNG: TÀI KHOẢN + NGÀY GIỜ + VỊ TRÍ GPS VÀO ẢNH
  applyWatermarkToCanvas(canvas);

  canvas.toBlob((blob) => {
    if (blob) {
      const fileName = `CHUP_HIEN_TRUONG_${Date.now()}.jpg`;
      selectedImageFile = new File([blob], fileName, { type: "image/jpeg", lastModified: Date.now() });

      document.getElementById("imagePreview").src = URL.createObjectURL(blob);
      document.getElementById("imagePreviewContainer").classList.remove("d-none");
      document.getElementById("uploadZone").classList.add("d-none");
      
      const officerName = document.getElementById("officerName").value;
      document.getElementById("fileInfoText").innerHTML = `<i class="bi bi-patch-check-fill text-success"></i> Đã gán thành công <strong>${escapeHtml(officerName)}</strong>, Ngày giờ & GPS vào ảnh!`;

      stopLiveCamera();
      const modal = bootstrap.Modal.getInstance(document.getElementById("cameraModal"));
      if (modal) modal.hide();

      showToast("Đã chụp và tự động đóng dấu tài khoản, ngày giờ & vị trí vào ảnh!", "success");
    }
  }, "image/jpeg", 0.85);
}

/**
 * XỬ LÝ CAMERA HỆ THỐNG (FALLBACK) - CŨNG TỰ ĐỘNG ĐÓNG DẤU Y HỆT
 */
function triggerDirectCameraFallback() {
  fetchGpsAutomatically(false);
  document.getElementById("cameraFallbackInput").click();
}

function handleCameraFallbackChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  const now = Date.now();
  const fileAgeMinutes = (now - file.lastModified) / (1000 * 60);

  if (fileAgeMinutes > 5) {
    showToast("CẢNH BÁO: Bạn vừa chọn ảnh cũ từ bộ sưu tập! Hệ thống bắt buộc chụp ảnh trực tiếp tại hiện trường.", "danger");
    removeSelectedImage();
    return;
  }

  // Tải ảnh vào Canvas để ĐÓNG DẤU TÀI KHOẢN + NGÀY GIỜ + GPS
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const maxWidth = 1920;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // ĐÓNG DẤU WATERMARK
      applyWatermarkToCanvas(canvas);

      canvas.toBlob((blob) => {
        if (blob) {
          selectedImageFile = new File([blob], `CHUP_HIEN_TRUONG_${Date.now()}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now()
          });

          document.getElementById("imagePreview").src = URL.createObjectURL(blob);
          document.getElementById("imagePreviewContainer").classList.remove("d-none");
          document.getElementById("uploadZone").classList.add("d-none");

          const officerName = document.getElementById("officerName").value;
          document.getElementById("fileInfoText").innerHTML = `<i class="bi bi-patch-check-fill text-success"></i> Đã gán thành công <strong>${escapeHtml(officerName)}</strong>, Ngày giờ & GPS vào ảnh!`;

          const modal = bootstrap.Modal.getInstance(document.getElementById("cameraModal"));
          if (modal) modal.hide();

          showToast("Đã chụp và tự động đóng dấu tài khoản, ngày giờ & vị trí vào ảnh!", "success");
        }
      }, "image/jpeg", 0.85);
    };
  };
}

function removeSelectedImage() {
  selectedImageFile = null;
  document.getElementById("cameraFallbackInput").value = "";
  document.getElementById("imagePreview").src = "";
  document.getElementById("imagePreviewContainer").classList.add("d-none");
  document.getElementById("uploadZone").classList.remove("d-none");
}

function captureGpsLocation() {
  fetchGpsAutomatically(true);
}

/**
 * 4. XỬ LÝ GỬI BÁO CÁO (TIẾP NHẬN ĐỒNG THỜI CAO 24/24)
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
    showToast("Vui lòng chọn tên cán bộ thực hiện!", "danger");
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

    const uniqueId = "rep_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8);
    const nowIso = new Date().toISOString();

    const reportData = {
      id: uniqueId,
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
      created_at: nowIso
    };

    // 1. Cập nhật ngay tại máy
    currentReports.unshift(reportData);
    sortReportsByDateTime();
    saveLocalReports(currentReports);
    renderAllTables(reportData.id);

    // 2. Phát Realtime 24/24 sang toàn bộ các máy khác
    publishRealtimeMessage(APP_CONFIG.REALTIME_TOPIC, {
      type: "NEW_REPORT",
      data: reportData
    });

    // 3. Lưu vào Supabase nếu có
    if (isConfigured && supabaseClient) {
      await supabaseClient.from("reports").insert([reportData]);
    }

    showToast("Đã gửi báo cáo thành công! Dữ liệu đã xuất hiện ngay ở bảng phía dưới.", "success");

    // Cuộn mượt xuống bảng ghi nhận phía dưới
    setTimeout(() => {
      const publicTableSection = document.getElementById("publicStaffReportsSection");
      if (publicTableSection) {
        publicTableSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 250);

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
 * 5. HIỂN THỊ CÁC BẢNG (BẢNG GHI NHẬN PHÍA DƯỚI FORM & BẢNG ADMIN)
 */
function renderAllTables(highlightId = null) {
  renderPublicStaffReportsTable(highlightId);
  renderReportsTable();
  updateAdminStatistics(currentReports);
  renderOfficerPerformanceDashboard(currentReports);
}

function renderPublicStaffReportsTable(highlightId = null) {
  const tbody = document.getElementById("publicStaffTableBody");
  const countEl = document.getElementById("publicRecordCount");
  if (!tbody) return;

  const searchVal = (document.getElementById("publicStaffSearchInput")?.value || "").toLowerCase().trim();
  const selectedOfficer = document.getElementById("officerName")?.value || "";

  let list = currentReports;

  if (filterOnlyMyReports && selectedOfficer) {
    list = list.filter(r => r.officer_name === selectedOfficer);
  }

  if (searchVal) {
    list = list.filter(r => 
      (r.officer_name && r.officer_name.toLowerCase().includes(searchVal)) ||
      (r.customer_name && r.customer_name.toLowerCase().includes(searchVal)) ||
      (r.address && r.address.toLowerCase().includes(searchVal)) ||
      (r.task_description && r.task_description.toLowerCase().includes(searchVal)) ||
      (r.task_result && r.task_result.toLowerCase().includes(searchVal))
    );
  }

  if (countEl) countEl.textContent = list.length;

  if (list.length === 0) {
    tbody.innerHTML = `<tr>
      <td colspan="8" class="text-center py-5 text-muted">
        <i class="bi bi-clipboard-x fs-2 d-block mb-2 text-secondary"></i>
        Chưa có dữ liệu báo cáo nào. Hãy thực hiện báo cáo đầu tiên ở form trên!
      </td>
    </tr>`;
    return;
  }

  let html = "";
  list.forEach((item, index) => {
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
        <i class="bi bi-geo-alt text-danger"></i> Vị trí
      </a>`;
    }

    const isHighlight = highlightId && String(item.id) === String(highlightId);
    const rowClass = isHighlight ? "table-success border-success" : "";

    html += `<tr class="${rowClass}">
      <td class="text-muted fw-bold text-center">${index + 1}</td>
      <td>
        <div class="fw-bold text-dark">${formatDateVNTime(item.created_at)}</div>
        <div class="small text-muted">${formatDateVN(item.start_date)} (${item.start_time} - ${item.end_time})</div>
      </td>
      <td>
        <div class="fw-semibold text-primary">${escapeHtml(item.officer_name)}</div>
        ${gpsLink}
      </td>
      <td>
        <div class="fw-semibold text-dark">${escapeHtml(item.customer_name || 'Khách hàng / Công việc')}</div>
        <div class="text-muted small text-truncate" style="max-width: 180px;">${escapeHtml(item.address || '')}</div>
      </td>
      <td>
        <div class="text-break" style="max-height: 70px; overflow-y: auto; font-size: 0.85rem;">
          <strong>CV:</strong> ${escapeHtml(item.task_description)}
        </div>
        <div class="text-break text-muted" style="max-height: 70px; overflow-y: auto; font-size: 0.85rem;">
          <strong>KQ:</strong> ${escapeHtml(item.task_result)}
        </div>
      </td>
      <td class="text-center"><span class="badge ${badgeClass}">${escapeHtml(item.status || 'Đạt')}</span></td>
      <td class="text-center">${imgThumb}</td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

function toggleMyReportsFilter(btn) {
  filterOnlyMyReports = !filterOnlyMyReports;
  if (filterOnlyMyReports) {
    btn.className = "btn btn-primary btn-sm rounded-pill px-3";
    btn.innerHTML = '<i class="bi bi-person-check-fill me-1"></i>Đang lọc: Báo cáo của tôi';
  } else {
    btn.className = "btn btn-outline-secondary btn-sm rounded-pill px-3";
    btn.innerHTML = '<i class="bi bi-people me-1"></i>Xem tất cả cán bộ';
  }
  renderPublicStaffReportsTable();
}

function applyPublicStaffFilter() {
  renderPublicStaffReportsTable();
}

/**
 * 6. QUẢN TRỊ VIÊN (ADMIN DASHBOARD)
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

  renderAllTables();
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

function renderOfficerPerformanceDashboard(reports) {
  const tbody = document.getElementById("officerDashboardTableBody");
  if (!tbody) return;

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
  document.getElementById("reportsListCard").scrollIntoView({ behavior: "smooth" });
}

function renderReportsTable() {
  const tbody = document.getElementById("adminTableBody");
  const countEl = document.getElementById("adminRecordCount");
  if (!tbody) return;

  const searchInput = document.getElementById("adminSearchInput");
  const filterOfficer = document.getElementById("adminFilterOfficer");
  const filterDate = document.getElementById("adminFilterDate");
  const filterStatus = document.getElementById("adminFilterStatus");

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

  if (countEl) countEl.textContent = filtered.length;

  const selectAll = document.getElementById("selectAllCheckbox");
  if (selectAll) selectAll.checked = false;
  updateBulkDeleteButtonState();

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-muted"><i class="bi bi-inbox fs-2 d-block mb-2"></i>Không có dữ liệu báo cáo nào phù hợp.</td></tr>`;
    return;
  }

  let html = "";
  filtered.forEach((item, index) => {
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
      <td><div class="text-break" style="max-height: 75px; overflow-y: auto; font-size: 0.85rem;">${escapeHtml(item.task_description)}</div></td>
      <td><div class="text-break" style="max-height: 75px; overflow-y: auto; font-size: 0.85rem;">${escapeHtml(item.task_result)}</div></td>
      <td class="text-center"><span class="badge ${badgeClass}">${escapeHtml(item.status || 'Đạt')}</span></td>
      <td class="text-center">${imgThumb}</td>
      <td class="text-center">
        <button class="btn btn-outline-danger btn-sm p-1" onclick="deleteSingleReport('${item.id}')" title="Xóa dòng này">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

/**
 * 7. QUẢN LÝ TÀI KHOẢN CÁN BỘ (ADMIN)
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

function openAddOfficerModal() {
  document.getElementById("officerModalTitle").textContent = "Cấp Tài Khoản Cán Bộ Mới";
  document.getElementById("officerEditId").value = "";
  document.getElementById("modalOfficerCode").value = `CB${String(currentOfficers.length + 1).padStart(2, '0')}`;
  document.getElementById("modalOfficerName").value = "";
  document.getElementById("modalOfficerPhone").value = "";
  document.getElementById("modalOfficerPin").value = "123456";
  document.getElementById("modalOfficerStatus").value = "active";

  new bootstrap.Modal(document.getElementById("officerActionModal")).show();
}

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

  new bootstrap.Modal(document.getElementById("officerActionModal")).show();
}

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
    const id = parseInt(idStr);
    const updated = currentOfficers.map(o => (o.id === id ? { ...o, code, name, phone, pin, status } : o));
    saveLocalOfficers(updated);

    if (isConfigured && supabaseClient) {
      await supabaseClient.from("officers").update({ code, name, phone, pin, status }).eq("id", id);
    }
    showToast(`Đã cập nhật thông tin cán bộ ${code}!`, "success");
  } else {
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
 * 8. TÍNH NĂNG XÓA DỮ LIỆU & RESET HỆ THỐNG
 */
async function deleteSingleReport(id) {
  if (!confirm("Bạn có chắc chắn muốn xóa bản ghi báo cáo này?")) return;

  try {
    currentReports = currentReports.filter(r => String(r.id) !== String(id));
    saveLocalReports(currentReports);
    renderAllTables();

    publishRealtimeMessage(APP_CONFIG.REALTIME_TOPIC + "/action", {
      type: "DELETE_REPORTS",
      ids: [id]
    });

    if (isConfigured && supabaseClient) {
      await supabaseClient.from("reports").delete().eq("id", id);
    }
    showToast("Đã xóa báo cáo thành công!", "success");
  } catch (err) {
    showToast("Lỗi xóa báo cáo: " + err.message, "danger");
  }
}

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

async function deleteSelectedReports() {
  const checkedBoxes = document.querySelectorAll(".report-select-checkbox:checked");
  const idsToDelete = Array.from(checkedBoxes).map(cb => String(cb.value));

  if (idsToDelete.length === 0) return;

  if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa ${idsToDelete.length} báo cáo đã chọn?`)) {
    return;
  }

  try {
    const delSet = new Set(idsToDelete);
    currentReports = currentReports.filter(r => !delSet.has(String(r.id)));
    saveLocalReports(currentReports);
    renderAllTables();

    publishRealtimeMessage(APP_CONFIG.REALTIME_TOPIC + "/action", {
      type: "DELETE_REPORTS",
      ids: idsToDelete
    });

    if (isConfigured && supabaseClient) {
      await supabaseClient.from("reports").delete().in("id", idsToDelete);
    }

    showToast(`Đã xóa thành công ${idsToDelete.length} báo cáo!`, "success");
    document.getElementById("selectAllCheckbox").checked = false;
    updateBulkDeleteButtonState();
  } catch (err) {
    showToast("Lỗi xóa báo cáo: " + err.message, "danger");
  }
}

async function deleteAllReports() {
  const confirmText = prompt("CẢNH BÁO NGUY HIỂM:\nHành động này sẽ XÓA TOÀN BỘ BÁO CÁO trên tất cả máy.\nNhập chữ 'XOA HET' vào ô dưới để xác nhận:");
  if (confirmText !== "XOA HET") {
    if (confirmText !== null) showToast("Bạn nhập không đúng chữ 'XOA HET', lệnh xóa bị hủy.", "info");
    return;
  }

  try {
    currentReports = [];
    saveLocalReports(currentReports);
    renderAllTables();

    publishRealtimeMessage(APP_CONFIG.REALTIME_TOPIC + "/action", {
      type: "RESET_SYSTEM"
    });

    if (isConfigured && supabaseClient) {
      await supabaseClient.from("reports").delete().neq("id", "0");
    }
    showToast("Đã xóa sạch toàn bộ dữ liệu báo cáo!", "success");
  } catch (err) {
    showToast("Lỗi khi xóa: " + err.message, "danger");
  }
}

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
 * 9. LƯU TRỮ CỤC BỘ & TIỆN ÍCH
 */
function getLocalReports() {
  const raw = localStorage.getItem("mock_reports_db");
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function saveLocalReports(reports) {
  localStorage.setItem("mock_reports_db", JSON.stringify(reports));
}

function setupEventListeners() {
  const searchInput = document.getElementById("adminSearchInput");
  const filterOfficer = document.getElementById("adminFilterOfficer");
  const filterDate = document.getElementById("adminFilterDate");
  const filterStatus = document.getElementById("adminFilterStatus");
  const btnReset = document.getElementById("btnResetFilter");

  if (searchInput) searchInput.addEventListener("input", renderReportsTable);
  if (filterOfficer) filterOfficer.addEventListener("change", renderReportsTable);
  if (filterDate) filterDate.addEventListener("change", renderReportsTable);
  if (filterStatus) filterStatus.addEventListener("change", renderReportsTable);

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (filterOfficer) filterOfficer.value = "";
      if (filterDate) filterDate.value = "";
      if (filterStatus) filterStatus.value = "";
      renderReportsTable();
    });
  }

  const publicSearch = document.getElementById("publicStaffSearchInput");
  if (publicSearch) {
    publicSearch.addEventListener("input", () => renderPublicStaffReportsTable());
  }
}

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

function exportReportsToCSV() {
  if (!currentReports || currentReports.length === 0) {
    showToast("Không có dữ liệu để xuất file!", "warning");
    return;
  }

  const headers = ["STT", "Thời gian báo cáo", "Cán bộ thực hiện", "Khách hàng / Công việc", "Địa chỉ", "Ngày bắt đầu", "Giờ bắt đầu", "Ngày kết thúc", "Giờ kết thúc", "Nội dung", "Kết quả", "Trạng thái", "Link ảnh"];
  let csvContent = "\uFEFF" + headers.join(",") + "\n";

  currentReports.forEach((r, idx) => {
    const row = [
      idx + 1,
      `"${formatDateVNTime(r.created_at)}"`,
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
      `"${r.image_url || ''}"`
    ];
    csvContent += row.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Bao_Cao_Giam_Sat_Cong_Viec_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  showToast("Đã xuất file Excel / CSV thành công!", "success");
}

function openLightbox(imageUrl, officer, customer) {
  document.getElementById("lightboxTitle").innerHTML = `<i class="bi bi-camera-fill me-2 text-warning"></i>${officer} - ${customer}`;
  document.getElementById("lightboxImage").src = imageUrl;
  document.getElementById("lightboxDirectLink").href = imageUrl;
  new bootstrap.Modal(document.getElementById("imageLightboxModal")).show();
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
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) { return isoStr; }
}

function formatTimeOnly(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (e) { return ""; }
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
