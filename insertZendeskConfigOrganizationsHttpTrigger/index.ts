import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions"
import processDataService from '../shared/services/insertZendeskConfigService';
import searchService from '../shared/services/searchForConfigOrganizationsTimerTriggerService';
import util from '../shared/utils/util';
import crmUtil from '../shared/utils/crmUtil';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const log: Logger = context.log;
        log('HTTP trigger insertZendeskConfigOrganizationsHttpTrigger function processed a request.');
    
        let organizationId = req.query.organizationId;
        const today = new Date();
    
        let updatedDateStart = req.query.updatedDateStart;
        if (!updatedDateStart) {
            // default value: two days ago
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(today.getDate() - 2);
            updatedDateStart = twoDaysAgo.toISOString().split('T')[0];
        }

        // default value: next day
        const nextDay = new Date();
        nextDay.setDate(today.getDate() + 1);
        let updatedDateEnd = nextDay.toISOString().split('T')[0];
        
        try {
            let update = 0;
            let insert = 0;
            let accessToken = await crmUtil.getAccessToken(log);
            const items = await searchService.retrieveData(log, updatedDateStart, updatedDateEnd, organizationId, null, null);
            await util.asyncForEach(items, async item => {
                let result = await processDataService.upsertZendeskConfig(log, accessToken, item);
                if (result == "UPDATE") {
                    update += 1;
                }
                if (result == "INSERT") {
                    insert += 1;
                }
            });
    
            let body = `<br>Inserted ${insert} records, updated ${update} records.`;
            body += "<br><br>" + JSON.stringify(items);
            context.res = {
                headers: {
                    "Content-Type": "text/html"
                },
                body
            };
        } catch (error) {
            log.error(error.message);
            context.res = {
                status: 500,
                body: "Error occurred in insertZendeskConfigUsersHttpTrigger API - Please check logs to find the details"
            };
        }
    
    };
    
    export default httpTrigger;