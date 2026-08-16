---
name: "config-model-gui-openclaw"
description: "Tạo và vận hành GUI cấu hình model OpenClaw theo wizard CLI, bảo toàn config, API key và tự chọn port khả dụng."
---

# OpenClaw model config GUI

Dùng khi người dùng muốn tạo, sửa, chạy hoặc mở rộng GUI cấu hình model OpenClaw.

## Quy tắc bắt buộc

- Không lưu API key thật trong skill, source template, proposal, log, screenshot, test fixture hoặc tài liệu.
- Không hardcode credential. Đọc secret runtime từ config hiện tại hoặc cơ chế secret phù hợp; khi hiển thị UI, che bằng dấu `•` và chỉ hiện khi người dùng bấm nút mắt.
- Không gửi lại `__OPENCLAW_REDACTED__` thành credential. Nếu CLI trả sentinel redacted, đọc secret runtime từ nguồn local được phép hoặc giữ nguyên secret cũ khi ô nhập để trống.
- Khi lưu, ô API key trống phải giữ API key cũ. Chỉ thay khi người dùng nhập key mới.
- `merge`: provider cùng ID được cập nhật, provider khác ID được thêm, provider không có trong form được giữ.
- `replace`: provider/model không còn trong form bị xóa có chủ đích. Với model list, dùng explicit replacement (`--replace-path models.providers.<id>.models`) để OpenClaw không chặn xóa model cũ.
- Model mặc định phải đọc từ config hiện tại khi load/refresh. Chỉ patch khi giá trị mới khác giá trị hiện tại; giá trị trống giữ nguyên.
- Sau thay đổi, chạy syntax check, API smoke test và `openclaw config validate`.

## UI flow

1. Đọc config hiện tại: mode, providers, models, API-key presence, default model, fallbacks và allowlist.
2. Provider chuẩn: hiển thị provider registry/search giống `openclaw configure --section model`; chọn provider rồi dùng auth/setup flow riêng theo provider.
3. `Custom Provider`: giữ form thủ công gồm provider ID, compatibility/API adapter, Base URL, auth, API key và model.
4. Tải model catalog qua resolver CLI tương đương `openclaw models list --all --provider <id> --json`; không tự đoán catalog nếu resolver có sẵn.
5. Hiển thị model catalog dạng dropdown/multi-select; giữ model configured/allowed nhưng không còn trong catalog với nhãn phù hợp.
6. Cho chọn model mặc định và fallback.
7. Refresh phải đọc lại toàn bộ config live, ghi đè draft UI.

## Backend save

- Đọc config/secret hiện tại trước khi tạo patch.
- Patch tối thiểu; không rewrite provider không đổi trong `merge`.
- Giữ các field không do GUI quản lý nếu không có yêu cầu xóa.
- Với `replace`, truyền `--replace-path` cho từng provider model array cần thay chính xác.
- Xóa allowlist entry tương ứng khi provider/model bị xóa; không làm mất allowlist ngoài phạm vi.
- Validate payload trước khi gọi `openclaw config patch`.

## Port

- Port mặc định: `18790`.
- Trước khi listen, kiểm tra port đang dùng.
- Nếu `18790` bận, thử lần lượt `18791`, `18792`, ...
- Chỉ chọn port bind được trên host; giới hạn tìm kiếm hợp lý và báo URL thực tế sau khi start.
- Hỗ trợ `PORT` override nếu người dùng chỉ định; nếu port override bận thì báo lỗi rõ, không âm thầm đổi trừ khi người dùng cho phép.
- UI/status phải hiển thị port thực tế.

## Verification

```bash
node --check server.mjs
node --check public/app.js
openclaw config validate
curl -fsS http://127.0.0.1:<actual-port>/api/config
```

Test thêm các case:

- Thêm provider trong `merge`, không nhập lại API key.
- Đổi mode sang `replace`, xóa provider/model, xác nhận config không còn entry cũ.
- Refresh sau khi config thay đổi ngoài web, xác nhận default model và provider cập nhật.
- Port mặc định bận, xác nhận tự chọn port kế tiếp khả dụng.

Không ghi credential thật vào output kiểm thử; chỉ log `hasApiKey`, độ dài hoặc prefix đã che nếu cần.
