import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions"
import processDataService from '../shared/services/insertZendeskTicketsService';
import searchService from '../shared/services/searchForTimerTriggerService';
import util from '../shared/utils/util';
import crmUtil from '../shared/utils/crmUtil';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const log: Logger = context.log;
    log('HTTP trigger insertZendeskTicketsHttpTrigger function processed a request.');

    let limit = req.query.limit;
    if (!limit) {
        limit = '50';
    }

    let formName = req.query.formName;
    if (!formName) {
        formName = "gbl - support";
    }

    const today = new Date();

    let updatedDateStart = req.query.updatedDateStart;
    // default value: two days ago
    if (!updatedDateStart) {
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(today.getDate() - 2);
        updatedDateStart = twoDaysAgo.toISOString().split('T')[0];
    }

    let updatedDateEnd = req.query.updatedDateEnd;
    // default value: two days after
    if (!updatedDateEnd) {
        const twoDaysLater = new Date();
        twoDaysLater.setDate(today.getDate() + 2);
        updatedDateEnd = twoDaysLater.toISOString().split('T')[0];
    }

    let createdDateStart = req.query.createdDateStart;
    // default value: 6 months
    if (!createdDateStart) {
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(today.getMonth() - 6);
        createdDateStart = sixMonthsAgo.toISOString().split('T')[0];
    }

    let createdDateEnd = req.query.createdDateEnd;
    // default value: two days after
    if (!createdDateEnd) {
        const twoDaysLater = new Date();
        twoDaysLater.setDate(today.getDate() + 2);
        createdDateEnd = twoDaysLater.toISOString().split('T')[0];
    }

    let onlySyncLatestData = req.query.onlySyncLatestData;
    let endPage = req.query.endPage;

    try {
        let update = 0;
        let insert = 0;
        let accessToken = await crmUtil.getAccessToken(log);

        if (onlySyncLatestData && onlySyncLatestData.toLowerCase() === 'true') {
            // get latest updated at value from CRM
            const latestUpdatedAt = await searchService.getLatestUpdatedAtValue(accessToken, log);
            if (latestUpdatedAt && latestUpdatedAt != '-') {
                updatedDateStart = latestUpdatedAt;
            }
        }

        const items = await searchService.retrieveData(log, accessToken, updatedDateStart, updatedDateEnd, createdDateStart, createdDateEnd, limit, formName, endPage);
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
            body: "Error occurred in insertZendeskTicketsHttpTrigger API - Please check logs to find the details"
        };
    }

};

export default httpTrigger;