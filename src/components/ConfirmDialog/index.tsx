import React from 'react';
import {Button, Popup} from '@nutui/nutui-react-taro';
import {Text, View} from '@tarojs/components';
import './index.less';

interface ConfirmDialogProps {
  /** 控制弹窗显示/隐藏 */
  visible: boolean;
  /** 标题，可以是字符串或React组件 */
  title?: React.ReactNode;
  /** 内容，可以是字符串或React组件 */
  content?: React.ReactNode;
  /** 确认按钮文字，默认"确认" */
  confirmText?: string;
  /** 取消按钮文字，默认"取消" */
  cancelText?: string;
  /** 点击确认按钮回调 */
  onConfirm?: () => void | Promise<void>;
  /** 点击取消按钮回调 */
  onCancel?: () => void;
  /** 点击遮罩层关闭时回调 */
  onClose?: () => void;
  /** 确认按钮类型 */
  confirmType?: 'primary' | 'success' | 'info' | 'warning' | 'danger';
  /** 是否在加载中 */
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title = '提示',
  content,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  onClose,
  confirmType = 'primary',
  loading = false,
}) => {
  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <Popup visible={visible} position="center" onClose={handleClose} closeOnOverlayClick={true}>
      <View className="confirm-dialog">
        {/* 标题区域 */}
        <View className="confirm-dialog-header">
          {typeof title === 'string' ? (
            <Text className="confirm-dialog-title">{title}</Text>
          ) : (
            title
          )}
        </View>

        {/* 内容区域 */}
        {content && (
          <View className="confirm-dialog-content">
            {typeof content === 'string' ? (
              <Text className="confirm-dialog-text">{content}</Text>
            ) : (
              content
            )}
          </View>
        )}

        {/* 按钮区域 */}
        <View className="confirm-dialog-footer">
          <Button type="default" onClick={handleCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button type={confirmType} onClick={handleConfirm} loading={loading} disabled={loading}>
            {confirmText}
          </Button>
        </View>
      </View>
    </Popup>
  );
};

export default ConfirmDialog;
