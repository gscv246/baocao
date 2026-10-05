# HỆ THỐNG GIÁM SÁT CÔNG VIỆC THẨM ĐỊNH HIỆN TRƯỜNG - V2.0

Ứng dụng Web App độc lập chạy trực tiếp trên GitHub Pages, hoàn toàn miễn phí, không phụ thuộc Google Sheets/Drive/Apps Script.

🔗 **Địa chỉ Web chính thức:** [https://gscv246.github.io/baocao/](https://gscv246.github.io/baocao/)

---

## 🌟 CÁC TÍNH NĂNG MỚI ĐƯỢC NÂNG CẤP THEO YÊU CẦU

### 1. BẮT BUỘC CHỤP ẢNH TỪ CAMERA (CHẶN CHỌN ẢNH CŨ TỪ MÁY)
- **Khung ngắm Camera trực tiếp (Live Camera Viewfinder):** Cán bộ bấm *"Bật Camera Chụp Ảnh"* ➔ Trình duyệt kích hoạt Camera thiết bị với nút chụp tròn đỏ và nút đổi camera trước/sau.
- **Tự động đóng dấu Watermark chống gian lận:** Ảnh chụp được in chìm thông tin: `[HIỆN TRƯỜNG THẨM ĐỊNH] + Ngày giờ thực tế + Tên cán bộ + Tọa độ GPS` vào đáy ảnh.
- **Chặn ảnh cũ trong thư viện:** Hệ thống kiểm tra thời gian tạo file, nếu phát hiện ảnh chụp cách thời điểm hiện tại quá 5 phút thì lập tức từ chối và cảnh báo.

### 2. DASHBOARD THỂ HIỆN CÔNG VIỆC CỦA MỌI CÁN BỘ
- Quản trị viên theo dõi được chi tiết hiệu suất của từng cán bộ:
  - Tên cán bộ & Mã CB.
  - Tổng số hồ sơ đã thực hiện.
  - Số lượng hồ sơ: Đạt chuẩn / Chờ bổ sung / Không đạt.
  - Tỷ lệ đạt (%) trực quan dạng thanh tiến độ (Progress Bar).
  - Thời điểm nộp báo cáo gần nhất.
  - Nút xem riêng các hồ sơ của cán bộ đó.

### 3. QUẢN TRỊ VIÊN CẤP & CHỈNH SỬA TÀI KHOẢN CÁN BỘ
- **Cấp tài khoản mới:** Thêm mã cán bộ (CB11, CB12...), họ tên, số điện thoại, mã PIN riêng.
- **Chỉnh sửa tài khoản:** Cập nhật thông tin, thay đổi mã PIN cá nhân.
- **Khóa / Mở khóa tài khoản:** Tạm khóa tài khoản cán bộ nghỉ phép hoặc thôi việc để ngăn gửi báo cáo.
- **Xóa tài khoản:** Xóa tài khoản cán bộ khỏi hệ thống.
- Danh sách lựa chọn ở form bên ngoài tự động cập nhật ngay khi Admin thêm/sửa tài khoản.

### 4. QUYỀN XÓA DỮ LIỆU & RESET HỆ THỐNG
- **Xóa từng mục:** Nút thùng rác ở từng dòng báo cáo.
- **Xóa theo nội dung chọn (Bulk Delete):** Tích chọn checkbox ở các dòng cần xóa (hoặc tích Chọn tất cả) ➔ Bấm nút đỏ *"Xóa các mục đã chọn"*.
- **Xóa toàn bộ báo cáo:** Nút xóa sạch tất cả báo cáo (yêu cầu gõ chữ xác nhận `XOA HET` để chống bấm nhầm).
- **Reset toàn bộ dữ liệu:** Khôi phục cài đặt gốc của hệ thống.

---

## 🔑 THÔNG TIN ĐĂNG NHẬP ADMIN MẶC ĐỊNH
- Bấm nút **"Quản Trị Viên"** màu vàng ở góc phải.
- Mã PIN mặc định: **`123456`** (Có thể đổi trong tệp `config.js`).
