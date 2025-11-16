import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions"
import searchService from '../shared/services/searchForTimerTriggerService';
import crmUtil from '../shared/utils/crmUtil';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const log: Logger = context.log;
    log('HTTP trigger insertZendeskTicketsHttpTrigger function processed a request.');
    
    // let limit = '50';
    // const today = new Date();
    
    // let updatedDateStart = req.query.updatedDateStart;
    // // default value: two days ago
    // if (!updatedDateStart) {
    //     const twoDaysAgo = new Date();
    //     twoDaysAgo.setDate(today.getDate() - 2);
    //     updatedDateStart = twoDaysAgo.toISOString().split('T')[0];
    // }

    // let updatedDateEnd = req.query.updatedDateEnd;
    // // default value: two days after
    // if (!updatedDateEnd) {
    //     const twoDaysLater = new Date();
    //     twoDaysLater.setDate(today.getDate() + 2);
    //     updatedDateEnd = twoDaysLater.toISOString().split('T')[0];
    // }

    // let createdDateStart = req.query.createdDateStart;
    // // default value: 6 months
    // if (!createdDateStart) {
    //     const sixMonthsAgo = new Date();
    //     sixMonthsAgo.setMonth(today.getMonth() - 6);
    //     createdDateStart = sixMonthsAgo.toISOString().split('T')[0];
    // }

    // let createdDateEnd = req.query.createdDateEnd;
    // // default value: two days after
    // if (!createdDateEnd) {
    //     const twoDaysLater = new Date();
    //     twoDaysLater.setDate(today.getDate() + 2);
    //     createdDateEnd = twoDaysLater.toISOString().split('T')[0];
    // }

    // let onlySyncLatestData = req.query.onlySyncLatestData;
    // let endPage = req.query.endPage;
    // let withoutUpdatedDate = req.query.withoutUpdatedDate;
    // if (!withoutUpdatedDate) {
    //     withoutUpdatedDate = 'false';
    // }
    
    // try {
    //     let accessToken = await crmUtil.getAccessToken(log);

    //     if (onlySyncLatestData && onlySyncLatestData.toLowerCase() === 'true') {
    //         // get latest created_at value from CRM
    //         const latestCreatedAt = await searchService.getLatestCreatedAtValue(accessToken, log);
    //         if (latestCreatedAt && latestCreatedAt != '-') {
    //             createdDateStart = latestCreatedAt;
    //         }
    //     }
        
    //     let formName = '';
    //     let ticketId = '';
    //     let withoutUpdatedDate = 'true';
    //     const items = await searchService.retrieveData(log, accessToken, updatedDateStart, updatedDateEnd, createdDateStart, createdDateEnd, limit, formName, endPage, ticketId, withoutUpdatedDate);
    //     let totalRecords = items && items.length;
    //     let result = `Created ${totalRecords} tickets`;
    //     log(result);
    // } catch (error) {
    //     log("Error occurred in insertZendeskTicketsTimerTrigger API - " + error.message);
    // }

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
            let accessToken = await crmUtil.getAccessToken(log);
            // get latest updated at value from CRM
            const latestCreatedAt = await searchService.getLatestCreatedAtValue(accessToken, log);
            if (latestCreatedAt && latestCreatedAt != '-') {
                createdDateStart = latestCreatedAt;
            }
            let formName = '';
            let endPage = '';
            let ticketId = '';
            let withoutUpdatedDate = 'true';
            const items = await searchService.retrieveData(log, accessToken, updatedDateStart, updatedDateEnd, createdDateStart, createdDateEnd, limit, formName, endPage, ticketId, withoutUpdatedDate);
            let totalRecords = items && items.length;
            let result = `Created ${totalRecords} tickets`;
            log(result);
        } catch (error) {
            log("Error occurred in insertZendeskTicketsTimerTrigger API - " + error.message);
        }

};

export default httpTrigger;