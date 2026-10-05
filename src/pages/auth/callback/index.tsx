import {useEffect, useState} from 'react';
import {Text, View} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {authApi} from '../../../services/authApi';
import {useAuthStore} from '../../../store/auth';
import {CLIENT_ID, cleanCallbackUrl, readCallbackParams, startSSO, verifyState} from '../../../utils/sso';

/**
 * SSO 回调页。
 *
 * 这个页面存在的唯一理由：**两次 302 全程是浏览器导航，前端读不到任何响应体**
 *（登录表单那次 POST 的响应被浏览器吃了，返回的是 302）。前端拿到令牌的唯一时机，
 * 就是这里的那一次 XHR —— `POST /auth/ticket`。
 *
 * 它做三件事，顺序不能换（见设计文档 §8.4）：
 *   1. 比对 state —— 不比对就等于可以被登成别人的账号
 *   2. 用票据换令牌并存下来
 *   3. 清掉地址栏上的 ticket，再进主页
 */
function AuthCallbackPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {ticket, state} = readCallbackParams();
        if (!ticket) {
          throw new Error('回调地址上没有票据');
        }

        // 1. 比对 state。取完即清，同一个 state 不能用第二次
        const returnTo = verifyState(state);

        // 2. 换令牌。票据 60 秒有效、用过即废，换不到就是真换不到了
        const data = await authApi.exchangeTicket(ticket, CLIENT_ID);
        useAuthStore.getState().applySession(data);

        // 3. 清 URL 再跳。**顺序不能反**：先跳走的话，地址栏上那张
        //    已经作废的票据会留在浏览历史里
        cleanCallbackUrl();
        Taro.redirectTo({url: returnTo});
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '登录失败，请重试');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '0 32px',
        gap: '20px',
        backgroundColor: '#f8f9fc',
      }}
    >
      {error ? (
        <>
          <Text data-testid="sso-error" style={{fontSize: '15px', color: '#e64340', textAlign: 'center'}}>
            {error}
          </Text>
          <Text
            data-testid="sso-retry"
            style={{fontSize: '15px', color: '#576b95'}}
            onClick={() => startSSO()}
          >
            点这里重新登录
          </Text>
        </>
      ) : (
        <Text data-testid="sso-loading" style={{fontSize: '15px', color: '#86909c'}}>
          正在登录…
        </Text>
      )}
    </View>
  );
}

export default AuthCallbackPage;
