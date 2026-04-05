import {DatePicker} from "@nutui/nutui-react-taro";
import {View} from "@tarojs/components";
import {useState} from "react";
import dayjs from "dayjs";

// TODO: onChange 事件给的Date类型的值，传入的是 string 类型的值，应该需要统一，时间的颗粒到什么地步

interface DatePickerProps {
  value?: string;
  type?: 'date' | 'datetime' | 'time';
  onChange?: (value: Date) => void;
  placeholder?: string;

}

const CustomDatePicker = (props: DatePickerProps) => {
  const {type = 'date', onChange, placeholder = '请选择时间'} = props
  const [show1, setShow1] = useState(false)
  const hasValue = !!props.value
  const parsedDate = hasValue ? dayjs(props.value) : null

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
        // selectedValue 是 [year, month, day, hour, minute, second] 格式的数组
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