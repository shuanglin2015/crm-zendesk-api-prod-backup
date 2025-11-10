import { AzureFunction, Context, Logger } from "@azure/functions"
import processDataService from '../shared/services/insertZendeskTicketsService';
import searchService from '../shared/services/searchForTimerTriggerService';
import util from '../shared/utils/util';
import crmUtil from '../shared/utils/crmUtil';

const timerTrigger: AzureFunction = async function (context: Context, myTimer: any): Promise<void> {
    const log: Logger = context.log;
    let timeStamp = new Date().toISOString(); 
    log('HTTP trigger insertZendeskTicketsTimerTrigger function processed a request.', timeStamp);

    let limit = '50';
    const today = new Date();

    // default value: two days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);
    let updatedDateStart = twoDaysAgo.toISOString().split('T')[0];
    
    // default value: two days after
    const twoDaysLater = new Date();
    twoDaysLater.setDate(today.getDate() + 2);
    let updatedDateEnd = twoDaysLater.toISOString().split('T')[0];

    // default value: 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    let createdDateStart = sixMonthsAgo.toISOString().split('T')[0];

    // default value: two days after
    let createdDateEnd = twoDaysLater.toISOString().split('T')[0];

    try {
        let update = 0;
        let insert = 0;
        let accessToken = await crmUtil.getAccessToken(log);
        // get latest updated at value from CRM
        const latestUpdatedAt = await searchService.getLatestUpdatedAtValue(accessToken, log);
        if (latestUpdatedAt && latestUpdatedAt != '-') {
            updatedDateStart = latestUpdatedAt;
        }
        const items = await searchService.retrieveData(log, accessToken, updatedDateStart, updatedDateEnd, createdDateStart, createdDateEnd, limit, '', '');
        await util.asyncForEach(items, async ticket => {
            let result = await processDataService.upsertZendeskTicket(log, accessToken, ticket);
            if (result == "UPDATE") {
                update += 1;
            }
            if (result == "INSERT") {
                insert += 1;
            }
        });

        let result = `Inserted ${insert} records, updated ${update} records.`;
        result += JSON.stringify(items);
        log(result);
    } catch (error) {
        log("Error occurred in insertZendeskTicketsTimerTrigger API - " + error.message);
    }
};

export default timerTrigger;
