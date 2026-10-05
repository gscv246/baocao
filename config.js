/**
 * ==============================================================================
 * TỆP CẤU HÌNH HỆ THỐNG GIÁM SÁT CÔNG VIỆC THẨM ĐỊNH (SERVERLESS)
 * ==============================================================================
 * Bạn chỉ cần thay thông tin Supabase của bạn vào đây.
 * Nếu để trống URL/KEY, hệ thống sẽ tự động chạy chế độ THỬ NGHIỆM (Lưu dữ liệu
 * cục bộ LocalStorage) để bạn có thể xem và kiểm tra tính năng ngay lập tức!
 */

const APP_CONFIG = {
  // 1. Cấu hình Backend Serverless (Supabase - Miễn phí 100%)
  // Lấy tại: https://supabase.com -> Project Settings -> API
  SUPABASE_URL: "",       // Ví dụ: "https://xyzcompany.supabase.co"
  SUPABASE_ANON_KEY: "",  // Chuỗi anon key public từ Supabase

  // 2. Mật mã Quản trị viên (Admin PIN) để vào trang quản lý và duyệt báo cáo
  ADMIN_PIN: "123456",

  // 3. Danh sách cán bộ thẩm định (Khoảng 30 nhân sự)
  // Bạn có thể sửa tên danh sách này theo đúng nhân sự của công ty bạn
  OFFICERS: [
    "01. Nguyễn Văn An",
    "02. Trần Đình Bảo",
    "03. Lê Hoàng Cường",
    "04. Phạm Quốc Dũng",
    "05. Hoàng Minh Đức",
    "06. Vũ Hải Đăng",
    "07. Đỗ Thành Đạt",
    "08. Bùi Quang Huy",
    "09. Đặng Gia Hưng",
    "10. Trịnh Công Minh",
    "11. Ngô Tuấn Kiệt",
    "12. Dương Văn Long",
    "13. Phan Trọng Nghĩa",
    "14. Mai Văn Nam",
    "15. Đinh Hữu Phước",
    "16. Lý Thanh Phong",
    "17. Tạ Đình Quân",
    "18. Cao Nhật Quang",
    "19. Lương Hùng Sơn",
    "20. Trương Đình Sang",
    "21. Đoàn Minh Thắng",
    "22. Hà Văn Toàn",
    "23. Chu Quốc Thịnh",
    "24. Lâm Thế Vinh",
    "25. Võ Tấn Tài",
    "26. Hồ Viết Tiến",
    "27. Huỳnh Tấn Phát",
    "28. Nguyễn Hữu Trí",
    "29. Trịnh Văn Thành",
    "30. Lê Văn Vũ"
  ],

  // 4. Các loại trạng thái công việc
  STATUS_OPTIONS: [
    { label: "Đạt yêu cầu", badgeClass: "bg-success" },
    { label: "Chờ bổ sung hồ sơ", badgeClass: "bg-warning text-dark" },
    { label: "Không đạt / Từ chối", badgeClass: "bg-danger" },
    { label: "Cần thẩm định lại", badgeClass: "bg-info text-dark" }
  ]
};
