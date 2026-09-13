import React from 'react';
import {Text} from '@tarojs/components';
import './index.less';

const STATUS_LABELS: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  cancelled: '已撤销',
};

interface RequestStatusTagProps {
  status: string;
  className?: string;
}

/** 存取分申请的状态药丸 */
const RequestStatusTag: React.FC<RequestStatusTagProps> = ({status, className = ''}) => {
  return (
    <Text className={`request-status ${status} ${className}`.trim()}>
      {STATUS_LABELS[status] || status}
    </Text>
  );
};

export default RequestStatusTag;
