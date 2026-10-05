/**
 * ==============================================================================
 * TỆP CẤU HÌNH HỆ THỐNG GIÁM SÁT CÔNG VIỆC THẨM ĐỊNH (SERVERLESS)
 * ==============================================================================
 */

const APP_CONFIG = {
  // 1. Cấu hình Backend Serverless (Supabase - Miễn phí 100%)
  // Lấy tại: https://supabase.com -> Project Settings -> API
  SUPABASE_URL: "",       // Điền URL Supabase của bạn nếu muốn lưu đám mây vĩnh viễn
  SUPABASE_ANON_KEY: "",  // Chuỗi anon key public từ Supabase

  // 2. Mật mã Quản trị viên (Admin PIN) để vào trang quản lý, phân quyền, xóa dữ liệu
  ADMIN_PIN: "123456",

  // 3. Danh sách cán bộ khởi tạo ban đầu (Nếu chưa có trong Database)
  // Quản trị viên có thể THÊM, SỬA, KHÓA, XÓA trực tiếp trên giao diện Admin
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

  // 4. Các trạng thái công việc
  STATUS_OPTIONS: [
    { label: "Đạt yêu cầu", badgeClass: "bg-success" },
    { label: "Chờ bổ sung hồ sơ", badgeClass: "bg-warning text-dark" },
    { label: "Không đạt / Từ chối", badgeClass: "bg-danger" },
    { label: "Cần thẩm định lại", badgeClass: "bg-info text-dark" }
  ]
};
