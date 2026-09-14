/**
 * 解码从路由参数里取到的值。
 *
 * 必须解一次的原因：Taro 的路由层解析 query 时显式关闭了解码
 * （H5 见 @tarojs/router 的 queryString.parse(search, { decode: false })，
 * 小程序端的 page options 同样保持原样）。所以跳转方用 encodeURIComponent
 * 拼进去的中文，在 router.params 里拿到的仍是编码后的串。
 *
 * 解码失败（例如原文里有裸 % 号导致 URIError）就原样返回，避免整页崩掉。
 * 未编码的普通文本解码后不变，所以重复调用是安全的。
 */
export const decodeParam = (value?: string): string => {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
