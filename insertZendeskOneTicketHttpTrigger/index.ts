import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions"
import processDataService from '../shared/services/insertZendeskTicketsService';
import searchService from '../shared/services/searchForOneTicketService';
import util from '../shared/utils/util';
import crmUtil from '../shared/utils/crmUtil';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const log: Logger = context.log;
    log('HTTP trigger insertZendeskOneTicketHttpTrigger function processed a request.');

    let ticketId = req.query.ticketId;

    try {
        let update = 0;
        let insert = 0;
        let accessToken = await crmUtil.getAccessToken(log);
        const items = await searchService.retrieveData(log, accessToken, ticketId);
        await util.asyncForEach(items, async ticket => {
            let result = await processDataService.upsertZendeskTicket(log, accessToken, ticket);
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
            body: "Error occurred in insertZendeskOneTicketHttpTrigger API - Please check logs to find the details"
        };
    }

};

export default httpTrigger;