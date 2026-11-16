/*
 * Token của lời mời trong bản giả (M7-01): sinh xác định từ email nên cùng
 * một lời mời luôn mở được cùng một link /join/[token], không cần lưu riêng.
 * Dùng chung cho bản giả (so khớp khi nhận lời mời) và giao diện (hiện link
 * mời để mở trong trình duyệt khác). Khi nối database thật, token sẽ do máy
 * chủ sinh và lưu vào bản ghi lời mời.
 */
export function inviteToken(email: string): string {
  return `inv-${email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}
