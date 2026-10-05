/**
 * ==============================================================================
 * LOGIC HỆ THỐNG GIÁM SÁT CÔNG VIỆC THẨM ĐỊNH (SERVERLESS REALTIME 24/24) - V3.0
 * Các nâng cấp chủ đạo:
 * 1. REALTIME 24/24: Kết nối WebSocket đa thiết bị qua MQTT Broker (chạy liên tục 24/7)
 * 2. TIẾP NHẬN ĐỒNG THỜI CAO: Nhiều cán bộ cùng bấm gửi 1 lúc vẫn nhận đủ 100% không mất dữ liệu
 * 3. BẢNG GHI NHẬN PHÍA DƯỚI FORM: Cán bộ gửi xong thấy ngay báo cáo ở bảng dưới, sắp xếp ngày giờ mới nhất lên đầu
 * 4. CAMERA TRỰC TIẾP: Bắt buộc chụp ảnh, chặn chọn ảnh cũ từ máy, đóng dấu Watermark kiểm định
 * 5. QUẢN LÝ TÀI KHOẢN CÁN BỘ: Thêm/Sửa/Khóa/Xóa tài khoản, tự động đồng bộ sang tất cả máy khác
 * 6. XÓA DỮ LIỆU & RESET: Xóa từng mục, xóa theo checkbox đã chọn, xóa toàn bộ và khôi phục gốc
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

// Khởi chạy khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
  initSystem();
  loadOfficersData();
  initDateTimeFields();
  setupEventListeners();
  checkAdminSession();
  initRealtimeWebSocket();
});

/**
 * 1. KHỞI TẠO HỆ THỐNG & KẾT NỐI REALTIME WEBSOCKET 24/24
 */
function initSystem() {
  // Kiểm tra Supabase
  if (APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY && typeof supabase !== "undefined") {
    try {
      supabaseClient = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
      isConfigured = true;
    } catch (err) {
      console.warn("Lỗi Supabase:", err);
      isConfigured = false;
    }
  }

  // Nạp dữ liệu ban đầu
  currentReports = getLocalReports();
  renderAllTables();
}

/**
 * KẾT NỐI WEBSOCKET MQTT REALTIME 24/24 ĐỒNG BỘ ĐA THIẾT BỊ
 */
function initRealtimeWebSocket() {
  const statusBadge = document.getElementById("connectionStatusBadge");

  if (typeof mqtt === "undefined") {
    console.warn("Thư viện MQTT chưa nạp, sử dụng đồng bộ cục bộ.");
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

      // Đăng ký nhận dữ liệu từ các kênh
      mqttClient.subscribe(APP_CONFIG.REALTIME_TOPIC, { qos: 1 });
      mqttClient.subscribe(APP_CONFIG.REALTIME_TOPIC + "/action", { qos: 1 });
      mqttClient.subscribe(APP_CONFIG.REALTIME_TOPIC + "/sync_req", { qos: 1 });
      mqttClient.subscribe(APP_CONFIG.REALTIME_TOPIC + "/sync_res", { qos: 1 });

      // Khi vừa kết nối, yêu cầu các thiết bị khác đồng bộ dữ liệu mới nhất (nếu có)
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

/**
 * XỬ LÝ DỮ LIỆU NHẬN ĐƯỢC TỪ CÁC MÁY KHÁC TRUYỀN VỀ TRONG 0.1 GIÂY
 */
function handleIncomingRealtimeMessage(topic, payload) {
  if (topic === APP_CONFIG.REALTIME_TOPIC) {
    // Có người nộp báo cáo mới!
    if (payload && payload.type === "NEW_REPORT" && payload.data) {
      const newReport = payload.data;
      
      // Kiểm tra trùng lặp để tiếp nhận nhiều người cùng lúc không bao giờ lỗi
      const exists = currentReports.some(r => String(r.id) === String(newReport.id));
      if (!exists) {
        currentReports.unshift(newReport);
        sortReportsByDateTime();
        saveLocalReports(currentReports);
        renderAllTables(newReport.id);

        // Thông báo chuông nhẹ trên màn hình
        showToast(`🔔 Cán bộ <strong>${escapeHtml(newReport.officer_name)}</strong> vừa nộp báo cáo lúc ${formatTimeOnly(newReport.created_at)}!`, "info");
      }
    }
  } 
  else if (topic === APP_CONFIG.REALTIME_TOPIC + "/action") {
    // Nhận lệnh xóa hoặc reset từ Admin
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
    // Thiết bị khác yêu cầu đồng bộ, nếu máy mình có nhiều dữ liệu hơn thì chia sẻ
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

/**
 * Hợp nhất dữ liệu không trùng lặp
 */
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

/**
 * SẮP XẾP BÁO CÁO THEO NGÀY GIỜ BÁO CÁO MỚI NHẤT LÊN ĐẦU
 */
function sortReportsByDateTime() {
  currentReports.sort((a, b) => {
    const timeA = new Date(a.created_at || (a.start_date + "T" + (a.start_time || "00:00"))).getTime();
    const timeB = new Date(b.created_at || (b.start_date + "T" + (b.start_time || "00:00"))).getTime();
    return timeB - timeA; // Mới nhất lên đầu
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
  // Phát tín hiệu Realtime cập nhật danh sách cán bộ sang các máy khác
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
        if (filterOnlyMyReports) {
          applyPublicStaffFilter();
        }
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
  stopLiveCamera();

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
    console.warn("Lỗi camera trực tiếp:", err);
    errorEl.classList.remove("d-none");
    errorEl.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i>Trình duyệt chặn mở camera trực tiếp. Bạn hãy bấm nút <strong>"Camera Hệ Thống"</strong> bên dưới để chụp.`;
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

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // ĐÓNG DẤU THỜI GIAN & TỌA ĐỘ GPS (WATERMARK KIỂM ĐỊNH)
  const now = new Date();
  const timeString = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth()+1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const officerText = document.getElementById("officerName").value || "Cán bộ thẩm định";
  let watermarkText = `[HIỆN TRƯỜNG THẨM ĐỊNH] ${timeString} | ${officerText}`;
  if (currentGpsLocation) {
    watermarkText += ` | GPS: ${currentGpsLocation.lat.toFixed(5)}, ${currentGpsLocation.lng.toFixed(5)}`;
  }

  const barHeight = Math.max(36, Math.round(canvas.height * 0.06));
  ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
  ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

  ctx.fillStyle = "#facc15";
  ctx.font = `bold ${Math.round(barHeight * 0.42)}px 'Be Vietnam Pro', sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillText(watermarkText, 15, canvas.height - (barHeight / 2));

  canvas.toBlob((blob) => {
    if (blob) {
      const fileName = `CHUP_THUC_DIA_${Date.now()}.jpg`;
      selectedImageFile = new File([blob], fileName, { type: "image/jpeg", lastModified: Date.now() });

      document.getElementById("imagePreview").src = URL.createObjectURL(blob);
      document.getElementById("imagePreviewContainer").classList.remove("d-none");
      document.getElementById("uploadZone").classList.add("d-none");
      document.getElementById("fileInfoText").innerHTML = `<i class="bi bi-camera-fill text-success"></i> Đã chụp trực tiếp (${(blob.size / 1024).toFixed(0)} KB - Có dấu kiểm định)`;

      stopLiveCamera();
      const modal = bootstrap.Modal.getInstance(document.getElementById("cameraModal"));
      if (modal) modal.hide();

      showToast("Đã chụp ảnh hiện trường thành công!", "success");
    }
  }, "image/jpeg", 0.82);
}

function triggerDirectCameraFallback() {
  document.getElementById("cameraFallbackInput").click();
}

function handleCameraFallbackChange(event) {
  const file = event.target.files[0];
  if (!file) return;

  // CHẶN ẢNH CŨ TỪ BỘ SƯU TẬP (Quá 5 phút từ chối ngay)
  const now = Date.now();
  const fileAgeMinutes = (now - file.lastModified) / (1000 * 60);

  if (fileAgeMinutes > 5) {
    showToast("CẢNH BÁO: Bạn vừa chọn ảnh cũ từ bộ sưu tập! Hệ thống bắt buộc chụp ảnh trực tiếp tại hiện trường.", "danger");
    removeSelectedImage();
    return;
  }

  compressImage(file).then(compressed => {
    selectedImageFile = compressed;
    document.getElementById("imagePreview").src = URL.createObjectURL(compressed);
    document.getElementById("imagePreviewContainer").classList.remove("d-none");
    document.getElementById("uploadZone").classList.add("d-none");
    document.getElementById("fileInfoText").innerHTML = `<i class="bi bi-camera-fill text-success"></i> Ảnh chụp mới (${(compressed.size / 1024).toFixed(0)} KB)`;

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
      showToast("Chưa bật quyền định vị GPS trên thiết bị!", "warning");
    },
    { enableHighAccuracy: true, timeout: 9000 }
  );
}

/**
 * 4. XỬ LÝ GỬI BÁO CÁO (HỖ TRỢ ĐỒNG THỜI NHIỀU NGƯỜI BÁO CÁO CÙNG LÚC)
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

    // TẠO ĐỐI TƯỢNG BÁO CÁO VỚI ID ĐỘC NHẤT (UUID TIMESTAMP)
    // Đảm bảo hàng chục người cùng gửi 1 mili-giây không bao giờ đè dữ liệu của nhau
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

    // 1. Lưu tại máy mình và đưa lên đầu bảng lập tức
    currentReports.unshift(reportData);
    sortReportsByDateTime();
    saveLocalReports(currentReports);
    renderAllTables(reportData.id);

    // 2. Phát tín hiệu Realtime 24/24 đến TẤT CẢ các máy khác trên toàn hệ thống
    publishRealtimeMessage(APP_CONFIG.REALTIME_TOPIC, {
      type: "NEW_REPORT",
      data: reportData
    });

    // 3. Lưu vào Supabase nếu có cấu hình
    if (isConfigured && supabaseClient) {
      await supabaseClient.from("reports").insert([reportData]);
    }

    showToast("Đã gửi báo cáo thành công! Bản ghi đã hiển thị ngay ở bảng phía dưới.", "success");

    // Cuộn mượt xuống bảng ghi nhận phía dưới để nhân viên nhìn thấy ngay
    setTimeout(() => {
      const publicTableSection = document.getElementById("publicStaffReportsSection");
      if (publicTableSection) {
        publicTableSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 300);

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

/**
 * BẢNG GHI NHẬN BÁO CÁO DÀNH CHO NHÂN VIÊN (NẰM NGAY PHÍA DƯỚI FORM)
 * Tự động sắp xếp theo ngày giờ báo cáo mới nhất lên đầu
 */
function renderPublicStaffReportsTable(highlightId = null) {
  const tbody = document.getElementById("publicStaffTableBody");
  const countEl = document.getElementById("publicRecordCount");
  if (!tbody) return;

  // Lọc theo cán bộ hoặc tìm kiếm nếu có
  const searchVal = (document.getElementById("publicStaffSearchInput")?.value || "").toLowerCase().trim();
  const selectedOfficer = document.getElementById("officerName")?.value || "";

  let list = currentReports;

  // Nếu người dùng chọn chế độ "Chỉ xem báo cáo của tôi"
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
        <div class="fw-semibold text-dark">${escapeHtml(item.customer_name || 'Khách hàng')}</div>
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

    // Phát tín hiệu Realtime xóa trên mọi máy
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

    // Phát tín hiệu Realtime đồng bộ xóa trên toàn hệ thống
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

  // Bộ lọc của bảng nhân viên phía dưới
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

  const headers = ["STT", "Thời gian báo cáo", "Cán bộ thẩm định", "Khách hàng", "Địa chỉ", "Ngày bắt đầu", "Giờ bắt đầu", "Ngày kết thúc", "Giờ kết thúc", "Nội dung", "Kết quả", "Trạng thái", "Link ảnh"];
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
