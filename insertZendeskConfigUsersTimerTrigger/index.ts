import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions"
import processDataService from '../shared/services/insertZendeskConfigService';
import searchService from '../shared/services/searchForConfigUsersTimerTriggerService';
import util from '../shared/utils/util';
import crmUtil from '../shared/utils/crmUtil';

const timerTrigger: AzureFunction = async function (context: Context, myTimer: any): Promise<void> {
    const log: Logger = context.log;
        log('HTTP trigger insertZendeskConfigUsersTimerTrigger function processed a request.');
    
        let userId = null;
        const today = new Date();
    
        // default value: two days ago
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(today.getDate() - 2);
        let updatedDateStart = twoDaysAgo.toISOString().split('T')[0];
    
        // default value: next day
        const nextDay = new Date();
        nextDay.setDate(today.getDate() + 1);
        let updatedDateEnd = nextDay.toISOString().split('T')[0];
        
        try {
            let update = 0;
            let insert = 0;
            let accessToken = await crmUtil.getAccessToken(log);
            const items = await searchService.retrieveData(log, updatedDateStart, updatedDateEnd, userId, null, null);
            await util.asyncForEach(items, async item => {
                let result = await processDataService.upsertZendeskConfig(log, accessToken, item);
                if (result == "UPDATE") {
                    update += 1;
                }
                if (result == "INSERT") {
                    insert += 1;
                }
            });
    
            let body = `Inserted ${insert} records, updated ${update} records.`;
            body += JSON.stringify(items);
            log(body);
        } catch (error) {
            log.error(error.message);
        }
    
    };
    
    export default timerTrigger;