# LearnEnglishBegin v2

Web tra từ tiếng Anh có:
- Dịch Anh → Việt
- Nhận diện từ loại (noun, verb, adjective, adverb...)
- Word forms / word family
- Definition
- Synonyms
- Antonyms
- Examples
- Phát âm
- Quiz 4 lựa chọn từ lịch sử các từ đã tra
- Giao diện responsive, dark glassmorphism

## Chạy thử

Không cần VS Code. Có thể mở `index.html` bằng trình duyệt.

Nếu trình duyệt chặn API khi mở file trực tiếp, dùng một web server đơn giản:
- VS Code Live Server, hoặc
- GitHub Pages sau khi upload.

## API đang dùng
- Free Dictionary API: từ loại, định nghĩa, ví dụ, phonetic
- Datamuse: synonyms / antonyms
- MyMemory: English → Vietnamese translation

## Lưu ý về Word Forms
Không có API miễn phí nào đảm bảo trả "mọi" word form của mọi từ. Bản này kết hợp dữ liệu từ điển với word-family phổ biến và bảng các từ mẫu. Có thể nâng cấp tiếp bằng một backend + cơ sở dữ liệu word family lớn hơn.

### Phát âm v2
- Hiển thị IPA/phonetic khi từ điển có dữ liệu.
- Có nút Listen dùng audio UK/US từ Free Dictionary API khi có.
- Nếu API không có audio, web dùng giọng đọc English (en-US) của trình duyệt.
