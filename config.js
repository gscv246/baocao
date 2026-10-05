/**
 * ==============================================================================
 * TỆP CẤU HÌNH HỆ THỐNG GIÁM SÁT CÔNG VIỆC (REALTIME 24/24)
 * ==============================================================================
 */

const APP_CONFIG = {
  // 1. Cấu hình Kênh Realtime WebSocket 24/24 (Đồng bộ đa thiết bị tức thì)
  // Giúp 30 cán bộ và Admin cùng lúc nhìn thấy dữ liệu của nhau chỉ sau 0.1 giây
  REALTIME_BROKER: "wss://broker.emqx.io:8084/mqtt",
  REALTIME_TOPIC: "gscv246/baocao/realtime_feed",

  // 2. Cấu hình Backend Serverless Supabase (Tùy chọn lưu trữ đám mây vĩnh viễn)
  SUPABASE_URL: "",       
  SUPABASE_ANON_KEY: "",  

  // 3. Mật mã Quản trị viên (Admin PIN) để vào trang quản trị
  ADMIN_PIN: "123456",

  // 4. Cấu hình Đồng Bộ Google Drive & Google Sheets (Tùy chọn)
  // URL Web App triển khai từ Google Apps Script (Code.gs)
  GOOGLE_DRIVE_URL: "",

  // 5. Danh sách cán bộ khởi tạo ban đầu
  INITIAL_OFFICERS: [
    { code: "CB01", name: "Nguyễn Văn An", phone: "0901234501", pin: "123456", status: "active" },
    { code: "CB02", name: "Trần Đình Bảo", phone: "0901234502", pin: "123456", status: "active" },
    { code: "CB03", name: "Lê Hoàng Cường", phone: "0901234503", pin: "123456", status: "active" },
    { code: "CB04", name: "Phạm Quốc Dũng", phone: "0901234504", pin: "123456", status: "active" },
    { code: "CB05", name: "Hoàng Minh Đức", phone: "0901234505", pin: "123456", status: "active" },
    { code: "CB06", name: "Vũ Hải Đăng", phone: "0901234506", pin: "123456", status: "active" },
    { code: "CB07", name: "Đỗ Thành Đạt", phone: "0901234507", pin: "123456", status: "active" },
    { code: "CB08", name: "Bùi Quang Huy", phone: "0901234508", pin: "123456", status: "active" },
    { code: "CB09", name: "Đặng Gia Hưng", phone: "0901234509", pin: "123456", status: "active" },
    { code: "CB10", name: "Trịnh Công Minh", phone: "0901234510", pin: "123456", status: "active" }
  ],

  // 6. Các trạng thái công việc
  STATUS_OPTIONS: [
    { label: "Đạt yêu cầu", badgeClass: "bg-success" },
    { label: "Chờ bổ sung hồ sơ", badgeClass: "bg-warning text-dark" },
    { label: "Không đạt / Từ chối", badgeClass: "bg-danger" },
    { label: "Cần kiểm tra lại", badgeClass: "bg-info text-dark" }
  ]
};
