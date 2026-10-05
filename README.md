# HỆ THỐNG GIÁM SÁT CÔNG VIỆC - V4.0 (REALTIME 24/24)

Ứng dụng Web App độc lập chạy trực tiếp trên GitHub Pages, hoàn toàn miễn phí, không phụ thuộc Google Sheets/Drive/Apps Script.

🔗 **Địa chỉ Web chính thức:** [https://gscv246.github.io/baocao/](https://gscv246.github.io/baocao/)

---

## 🌟 CÁC TÍNH NĂNG NỔI BẬT

### 1. TỰ ĐỘNG GÁN TÀI KHOẢN, NGÀY GIỜ VÀ TỌA ĐỘ VÀO ẢNH CHỤP
- Khi mở Camera:
  - Khung ngắm Camera hiển thị trực tiếp thanh HUD thông tin: **Tên cán bộ thực hiện | Đồng hồ đếm giây (Live) | Tọa độ GPS hiện trường**.
  - Tự động lấy vị trí GPS trong background, người dùng không cần phải bấm nút riêng.
- Khi bấm nút chụp:
  - Ảnh được in chìm dải băng kiểm định Watermark chuyên nghiệp gồm:
    - `[GIÁM SÁT CÔNG VIỆC - ẢNH HIỆN TRƯỜNG THỰC TẾ]`
    - `Tài khoản chụp: [Tên cán bộ]`
    - `Thời gian: [Ngày/Tháng/Năm Giờ:Phút:Giây]`
    - `Vị trí: [Tọa độ GPS vĩ độ, kinh độ] (Xác thực hiện trường)`
  - Ảnh này là độc nhất, chống gian lận, không thể làm giả từ ảnh cũ trong máy.

### 2. ĐỒNG BỘ REALTIME 24/24 ĐA THIẾT BỊ (WEBSOCKET MQTT)
- Tiếp nhận đồng thời cao: Hàng chục cán bộ cùng bấm gửi 1 lúc vẫn nhận đủ 100% không mất dữ liệu.
- Tốc độ truyền dưới 0.1 giây: Khi một cán bộ nộp báo cáo, tất cả các máy khác tự động nhảy dòng mới mà không cần tải lại trang.

### 3. BẢNG GHI NHẬN NẰM NGAY PHÍA DƯỚI FORM
- Cán bộ nộp xong nhìn thấy ngay báo cáo của mình xuất hiện tại bảng phía dưới.
- Dòng vừa nộp có hiệu ứng phát sáng xanh nhẹ (Highlight Pulse).
- Sắp xếp nghiêm ngặt theo ngày giờ báo cáo: **Báo cáo mới nhất luôn nằm ở dòng đầu tiên**.

### 4. BẢNG ĐIỀU KHIỂN QUẢN TRỊ VIÊN (ADMIN DASHBOARD)
- **Dashboard Hiệu suất cán bộ:** Bảng tổng hợp công việc của từng người, tỷ lệ hoàn thành, thời điểm nộp gần nhất.
- **Quản lý tài khoản:** Cấp tài khoản mới, chỉnh sửa thông tin, đặt lại mã PIN, khóa/xóa tài khoản.
- **Xóa dữ liệu & Reset:** Xóa từng mục, xóa theo checkbox đã chọn, xóa toàn bộ và khôi phục cài đặt gốc.

---

## 🔑 THÔNG TIN ĐĂNG NHẬP ADMIN MẶC ĐỊNH
- Bấm nút **"Quản Trị Viên"** màu vàng ở góc trên bên phải.
- Mã PIN mặc định: **`123456`** (Có thể thay đổi trong tệp `config.js`).
