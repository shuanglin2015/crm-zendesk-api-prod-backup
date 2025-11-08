import { Logger } from '@azure/functions';
import searchService from './searchByResellerIdService';

import envUtil from '../utils/envUtil';
import util from '../utils/util';

const verifyEnvironment = () => {
    const invalidKeys = [];
    Object.keys(envUtil).forEach((key: string) => {
        if (!key.startsWith('get')) {
            if (util.isNullOrEmpty(process.env[key])) {
                invalidKeys.push(key);
            }
        }
    });
    if (invalidKeys.length > 0) {
        return `.env missing keys: ${invalidKeys.toString()}`;
    } else {
        return '';
    }
};

const verify = async (log: Logger) => {
    const finalResultArr = [];

    const envResult = verifyEnvironment();
    if (envResult) {
        finalResultArr.push(envResult);
    }

    try {
        const result = await searchService.retrieveData(log, "1000106647", "1");
        if (result.status !== 200) {
            finalResultArr.push(result.statusText);
        }
        return finalResultArr.toString();

    } catch (error) {
        return `Healthcheck failed: ${error.message}`;
    }
};

export default {
    verify,
    verifyEnvironment,
};
