import {DatePicker} from "@nutui/nutui-react-taro";
import {View} from "@tarojs/components";
import {useState} from "react";
import dayjs from "dayjs";

interface DatePickerProps {
  value?: string | Date | null;
  type?: 'date' | 'datetime' | 'time';
  onChange?: (value: Date) => void;
  placeholder?: string;
}

const CustomDatePicker = (props: DatePickerProps) => {
  const {type = 'date', onChange, placeholder = '请选择时间', value} = props
  const [show1, setShow1] = useState(false)

  const hasValue = !!value
  const parsedDate = hasValue
    ? (typeof value === 'string' ? dayjs(value) : dayjs(value))
    : null

  return <View>
    <View
      style={{
        color: hasValue ? 'inherit' : '#969799',
        width: '100%',
      }}
      onClick={() => setShow1(true)}
      data-testid="date-picker-trigger"
    >{hasValue && parsedDate ? parsedDate.format('YYYY-MM-DD HH:mm:ss') : placeholder}</View>

    <DatePicker
      visible={show1}
      type={type}
      value={hasValue && parsedDate ? parsedDate.toDate() : new Date()}
      onConfirm={(_selectedOptions, selectedValue) => {
        const [year, month, day, hour = 0, minute = 0, second = 0] = selectedValue as number[];
        const date = new Date(year, month - 1, day, hour, minute, second);
        onChange?.(date);
        setShow1(false);
      }}
      onCancel={() => setShow1(false)}
    />
  </View>
}

export default CustomDatePicker