import Taro, { useRouter } from '@tarojs/taro';

/**
 * 获取当前页面的完整路径作为 redirectUri
 */
export const getCurrentRedirectUri = (): string => {
  try {
    // 获取当前路由信息
    const pages = Taro.getCurrentPages();
    if (pages.length > 0) {
      const currentPage = pages[pages.length - 1];
      const route = currentPage.route;
      const options = currentPage.options || {};

      // 构建查询参数字符串
      const queryParams = new URLSearchParams();
      for (const key in options) {
        if (Object.prototype.hasOwnProperty.call(options, key)) {
          queryParams.append(key, options[key]);
        }
      }
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';

      // 构建完整路径
      const fullPath = `${route}${queryString}`;
      return encodeURIComponent(fullPath);
    }
  } catch (error) {
    console.error('获取当前页面路径失败:', error);
  }

  // 降级方案：使用 hash 路由
  try {
    if (typeof window !== 'undefined' && window.location) {
      return encodeURIComponent(window.location.hash.slice(1) || '/pages/index/index');
    }
  } catch (error) {
    console.error('获取 hash 路由失败:', error);
  }

  // 最终降级：返回首页
  return encodeURIComponent('/pages/index/index');
};

/**
 * 跳转到登录页面，并携带 redirectUri
 */
export const redirectToLogin = (redirectUri?: string) => {
  const uri = redirectUri || getCurrentRedirectUri();
  Taro.redirectTo({
    url: `/pages/login/index?redirectUri=${uri}`,
  });
};

/**
 * 登录成功后，根据 redirectUri 进行回调跳转
 */
export const handleLoginRedirect = () => {
  const router = useRouter();
  const redirectUri = router.params?.redirectUri as string | undefined;

  if (redirectUri) {
    try {
      const decodedUri = decodeURIComponent(redirectUri);
      // 确保路径格式正确
      const targetUrl = decodedUri.startsWith('/') ? decodedUri : `/${decodedUri}`;
      Taro.redirectTo({
        url: targetUrl,
      });
      return true;
    } catch (error) {
      console.error('重定向失败:', error);
    }
  }

  // 如果没有 redirectUri，跳转到首页
  Taro.switchTab({
    url: '/pages/index/index',
  });
  return false;
};
