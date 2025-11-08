import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions";
import dataService from '../shared/services/getCommentByIdService';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const log: Logger = context.log;
    log('HTTP trigger getCommentById function processed a request.');

    let itemId = req.query.itemId;
    if (!itemId) {
        context.res = {
            status: 400,
            body: 'Please provide itemId parameter in the url to search'
        };
        return;
    }

    try {
        const response = await dataService.retrieveData(log, itemId);
        var body = await response.text();
        context.res = {
            body
        };
    } catch (error) {
        log.error(error);
        context.res = {
            status: 500,
            body: "Error occurred when fetch data by Id from the Zendesk API - " + error.name
        };
    }
};

export default httpTrigger;