import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions";
import searchService from '../shared/services/searchByResellerIdService';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const log: Logger = context.log;
    log('HTTP trigger searchByResellerId function processed a request.');

    let resellerId = req.query.resellerId;
    if (!resellerId) {
        context.res = {
            status: 400,
            body: 'Please provide resellerId parameter in the url to search'
        };
        return;
    }

    let limit = req.query.limit;
    if (!limit) {
        limit = '50';
    }

    try {
        const response = await searchService.retrieveData(log, resellerId, limit);
        var body = await response.text();
        context.res = {
            body
        };
    } catch (error) {
        log.error(error);
        context.res = {
            status: 500,
            body: "Error occurred when fetch data from the Zendesk API - " + error.name
        };
    }
};

export default httpTrigger;