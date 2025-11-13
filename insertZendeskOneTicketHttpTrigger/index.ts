import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions"
import searchService from '../shared/services/searchForTimerTriggerService';
import crmUtil from '../shared/utils/crmUtil';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const log: Logger = context.log;
    log('HTTP trigger insertZendeskOneTicketHttpTrigger function processed a request.');

    let ticketId = req.query.ticketId;

    try {
        let accessToken = await crmUtil.getAccessToken(log);
        const items = await searchService.retrieveData(log, accessToken, '', '', '', '', '50', '', '', ticketId);

        let totalRecords = items && items.length;
        let body = `<br>Upserted ${totalRecords} ticket`;
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
            body: "Error occurred in insertZendeskOneTicketHttpTrigger API - Please check logs to find the details"
        };
    }

};

export default httpTrigger;