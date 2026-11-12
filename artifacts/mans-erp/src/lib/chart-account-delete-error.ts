/** The generated fetch client puts the parsed response on error.data, not response.data. */
export function chartAccountDeleteError(error: unknown, lang: string): string {
  const ar = lang === "ar";
  const failure = error as { status?: number; data?: { error?: unknown } } | null;
  if (failure?.status === 401)
    return ar ? "انتهت جلسة الدخول. سجّل الدخول وأعد المحاولة." : "Your session expired. Sign in and try again.";
  if (failure?.status === 403)
    return ar ? "حسابك لا يملك صلاحية حذف الحسابات في هذه المنظمة." : "You do not have permission to delete accounts in this organization.";
  if (failure?.status === 404)
    return ar ? "الحساب غير موجود أو حُذف سابقًا. حدّث قائمة الحسابات." : "Account not found or already deleted. Refresh the account list.";
  if (failure?.status && failure.status >= 500)
    return ar ? "تعذر حذف الحساب بسبب خطأ في الخادم. أعد المحاولة." : "The server could not delete the account. Try again.";
  const message = typeof failure?.data?.error === "string" ? failure.data.error : "";
  const children = message.match(/^Cannot delete an account with (\d+) sub-account\(s\)\./);
  if (children && ar)
    return `لا يمكن حذف الحساب؛ لديه ${children[1]} حسابًا فرعيًا. انقل الحسابات الفرعية أو احذف غير المستخدم منها أولًا.`;
  const transactions = message.match(/^Cannot delete an account with (\d+) transaction\(s\)\./);
  if (transactions && ar)
    return `لا يمكن حذف الحساب؛ لديه ${transactions[1]} حركة محاسبية. يمكنك تعطيله بدلًا من حذفه.`;
  return message || (ar ? "تعذر حذف الحساب. تحقق من الاتصال وأعد المحاولة." : "Could not delete the account. Check your connection and try again.");
}
