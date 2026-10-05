# HỆ THỐNG GIÁM SÁT CÔNG VIỆC THẨM ĐỊNH HIỆN TRƯỜNG (WEB SERVERLESS)

Ứng dụng Web App độc lập, hoạt động hoàn toàn miễn phí, **không phụ thuộc Google Apps Script / Google Sheets / Google Drive**. 

Có thể chạy trên **bất kỳ Hosting/cPanel nào**, hoặc đưa lên các nền tảng miễn phí tốc độ cao như **Netlify, Vercel, GitHub Pages**.

---

## 🌟 CÁC ƯU ĐIỂM VƯỢT TRỘI SO VỚI GOOGLE APPS SCRIPT
1. **Tốc độ cực nhanh:** Là trang web tĩnh (Static Web), mở trang tức thì trong 0.5s, không bị chậm hay giật lag như Google Apps Script.
2. **Nén ảnh trực tiếp tại điện thoại:** Cán bộ chụp ảnh 10MB - 15MB, hệ thống tự động nén xuống còn 300KB - 500KB bằng Canvas trước khi tải lên, giúp gửi báo cáo trong 1 - 2 giây ngay cả khi sóng 3G/4G yếu.
3. **Định vị GPS thực địa:** Tích hợp nút lấy tọa độ GPS thực tế của cán bộ khi đứng tại nhà khách hàng, Admin có thể nhấp vào để kiểm tra trên Google Maps.
4. **Ghi nhớ danh tính cán bộ:** Tự động lưu tên cán bộ trên thiết bị của họ, lần sau mở app không cần tìm chọn lại.
5. **Xuất báo cáo Excel / CSV:** 1 click xuất toàn bộ dữ liệu báo cáo ra file Excel tiếng Việt chuẩn xác.
6. **Xem ảnh mượt mà:** Xem ảnh thu nhỏ ngay trên bảng, bấm vào phóng to trực tiếp (Lightbox), không bị chặn quyền chia sẻ như Google Drive.

---

## 📁 CẤU TRÚC BỘ MÃ NGUỒN
- `index.html`: Toàn bộ giao diện Web (gồm Form Cán bộ và Dashboard Admin).
- `app.js`: Toàn bộ xử lý nén ảnh, định vị GPS, kết nối Database, lọc tìm kiếm.
- `config.js`: Nơi cấu hình thông tin Supabase, mã PIN Admin và danh sách 30 cán bộ.
- `schema.sql`: Mã lệnh tạo bảng Database và bộ nhớ lưu ảnh trên Supabase (1-click run).

---

## 🚀 HƯỚNG DẪN TRIỂN KHAI NHANH TRONG 5 PHÚT

### BƯỚC 1: DÙNG THỬ NGAY LẬP TỨC (KHÔNG CẦN CÀI ĐẶT GÌ)
Bạn có thể mở trực tiếp tệp `index.html` trên trình duyệt máy tính hoặc điện thoại. Hệ thống sẽ tự động chạy ở **Chế độ Thử nghiệm (LocalStorage)** với dữ liệu mẫu có sẵn để bạn kiểm tra toàn bộ giao diện và tính năng.

---

### BƯỚC 2: TẠO DATABASE & LƯU TRỮ ẢNH MIỄN PHÍ (SUPABASE)
Supabase là nền tảng Backend Serverless miễn phí tốt nhất hiện nay:
1. Đăng ký tài khoản miễn phí tại: **[https://supabase.com](https://supabase.com)** (đăng nhập bằng Github hoặc Email).
2. Bấm **New Project** ➔ Đặt tên dự án (VD: `giam-sat-tham-dinh`) ➔ Chọn mật khẩu database ➔ Bấm **Create new project**.
3. Ở menu bên trái, bấm vào biểu tượng **SQL Editor** (icon `>_`):
   - Mở tệp `schema.sql` trong dự án này, copy toàn bộ nội dung dán vào ô SQL.
   - Bấm nút **Run** màu xanh lá cây để hệ thống tự tạo bảng `reports` và thư mục lưu ảnh `report-images`.
4. Lấy thông tin kết nối:
   - Vào **Project Settings** (biểu tượng bánh răng góc dưới bên trái) ➔ Chọn **API**.
   - Copy **Project URL** và **Project API Keys (anon public)**.
5. Mở tệp `config.js` trên máy của bạn và dán vào:
   ```javascript
   const APP_CONFIG = {
     SUPABASE_URL: "https://your-project.supabase.co", // Dán URL của bạn
     SUPABASE_ANON_KEY: "eyJh......",                 // Dán anon key của bạn
     ADMIN_PIN: "123456",                             // Đổi mã PIN Admin nếu muốn
     ...
   ```

---

### BƯỚC 3: ĐƯA LÊN WEB ĐỂ 30 CÁN BỘ TRUY CẬP (CHỌN 1 TRONG 3 CÁCH)

#### CÁCH 1: NETLIFY (KHUYÊN DÙNG - CỰC NHANH, 30 GIÂY XONG)
1. Truy cập: **[https://app.netlify.com/drop](https://app.netlify.com/drop)**
2. Kéo thả toàn bộ thư mục chứa các file (`index.html`, `app.js`, `config.js`) vào ô upload.
3. Netlify sẽ cấp ngay cho bạn một đường link web miễn phí vĩnh viễn (dạng: `https://giam-sat-abc.netlify.app`) có sẵn bảo mật SSL HTTPS. Bạn chỉ cần gửi link này cho 30 cán bộ sử dụng.

#### CÁCH 2: UPLOAD LÊN HOSTING CPANEL CÓ SẴN CỦA BẠN
1. Đăng nhập vào cPanel Hosting của bạn.
2. Vào **File Manager** ➔ Mở thư mục `public_html` (hoặc thư mục con/subdomain tùy ý).
3. Upload 3 file: `index.html`, `app.js`, `config.js`.
4. Truy cập theo tên miền của bạn (VD: `https://tenmien.com/diemdanh`).

#### CÁCH 3: GITHUB PAGES
1. Đẩy các file lên 1 Repository trên GitHub.
2. Vào **Settings** ➔ **Pages** ➔ Chọn nhánh `main` ➔ Bấm **Save**.
3. Bạn sẽ nhận được đường link web dạng `https://username.github.io/repo-name`.

---

## 🔒 HƯỚNG DẪN SỬ DỤNG
1. **Dành cho Cán bộ Thẩm định (30 người):**
   - Mở link web trên điện thoại ➔ Ghim ra màn hình chính dạng Bookmark hoặc App icon.
   - Chọn tên cán bộ lần đầu tiên (hệ thống sẽ tự nhớ vĩnh viễn trên máy).
   - Nhập thông tin khách hàng, bấm **"Lấy vị trí GPS"** để ghi nhận tọa độ thực tế.
   - Chạm vào ô ảnh chụp hiện trường ➔ Bấm **GỬI BÁO CÁO**.

2. **Dành cho Quản trị viên (Admin):**
   - Bấm vào nút màu vàng **"Quản Trị Viên"** trên góc phải.
   - Nhập mã PIN (Mặc định: `123456`).
   - Màn hình Dashboard hiện ra: xem toàn bộ báo cáo, lọc theo từng cán bộ, xem ảnh phóng to, xem vị trí Google Maps, xuất file Excel.
