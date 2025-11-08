import _ from 'underscore';
import envUtil from './envUtil';

const asyncForEach = async (array: any, callback: any) => {
  if (array && callback) {
    for (let index = 0; index < array.length; index++) {
      await callback(array[index], index, array);
    }
  }
};

const getDaysByStartDate = (startDate) => {
  const today: any = new Date();
  const diffDays = Math.ceil(Math.abs(today - startDate) / (1000 * 60 * 60 * 24));
  return diffDays;
};

const getDiffDays = (startDate) => {
  const today: any = new Date();
  const diffDays = Math.ceil(Math.abs(today - startDate) / (1000 * 60 * 60 * 24));
  return diffDays;
};

const getStringDate = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const strYear = year.toString();
  let strMonth = month.toString();
  if (strMonth && strMonth.length === 1) {
    strMonth = '0' + strMonth;
  }
  let strDay = day.toString();
  if (strDay && strDay.length === 1) {
    strDay = '0' + strDay;
  }
  const strDate = `${strYear}-${strMonth}-${strDay}`;
  return strDate;
};

const isNullOrEmpty = (obj: any) => {
  if (!obj) {
      return true;
  }
  if (_.isNull(obj)) {
      return true;
  }
  if (_.isUndefined(obj)) {
      return true;
  }
  if (_.isString(obj) && _.isEqual(obj.toLowerCase(), 'undefined')) {
      return true;
  }
  if (_.isEmpty(obj)) {
      return true;
  }
  return false;
};

const logIfDebug = (log, operationId: string, msg: string) => {
  if (envUtil.ENABLE_DEBUG() === 'true') {
      log(operationId, msg);
  }
}

const resNoErr = (response: any) => {
  if (response.statusCode > 199 && response.statusCode < 400) {
    return true;
  } else {
    return false;
  }
};

const sleep = (milliseconds: number) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export default {
  asyncForEach,
  getDaysByStartDate,
  getDiffDays,
  getStringDate,
  isNullOrEmpty,
  logIfDebug,
  resNoErr,
  sleep,
};
