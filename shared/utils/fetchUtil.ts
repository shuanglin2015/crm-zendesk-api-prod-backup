import { Logger } from '@azure/functions';
import fetch from 'node-fetch';

const fetchData = (log: Logger,apiUrl: string, options) => {
    const operationId = '[fetchUtil] [fetchData]';
    log(operationId, apiUrl);
    
    return fetch(apiUrl, options);
  };
  
  export default {
    fetchData,
  };