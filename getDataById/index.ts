import { AzureFunction, Context, HttpRequest, Logger } from "@azure/functions";
import dataService from '../shared/services/getDataByIdService';
import envUtil from '../shared/utils/envUtil';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    const log: Logger = context.log;
    log('HTTP trigger getDataById function processed a request.');

    // &category=tickets&itemId=35116&userName=Shuang Lin Qu
    let userName = req.query.userName;
    if (!userName) {
        log.error('userName is not provided');
        context.res = {
            status: 400,
            body: "userName is not provided"
        };
        return;
    }
    log(`userName: ${userName}`);

    let allowedNamesStr = envUtil.ALLOWED_USER_NAMES();
    if (!allowedNamesStr) {
        allowedNamesStr = process.env.ALLOWED_USER_NAMES;
    }

    if (!allowedNamesStr) {
        log.error();
        context.res = {
            status: 400,
            body: 'ALLOWED_USER_NAMES is empty'
        };
        return;
    }
    log(`allowedNamesStr: ${allowedNamesStr}`);

    let allowedNames = [];
    try { 
        allowedNames =  JSON.parse(allowedNamesStr); 
    } catch {
        // try unescaping typical backslash-escaped quotes then parse
        const cleaned = allowedNamesStr.replace(/\\"/g, '"').replace(/\\'/g, "'");
        allowedNames = JSON.parse(cleaned);
    }

    log(`allowedNames: ${allowedNames && allowedNames.toString()}`)


    if (!allowedNames.includes(userName.toLocaleLowerCase())) {
        log(`Your userName ${userName} is not in the allowedNames list.`);
        return;
    }
    log(`allowedNames: ${allowedNames.toString()}`);

    let itemId = req.query.itemId;
    if (!itemId) {
        context.res = {
            status: 400,
            body: 'Please provide itemId parameter in the url to search'
        };
        return;
    }
    log(`itemId: ${itemId}`);

    try {
        log('getDataById, start to retrieve data from API...');
        const response = await dataService.retrieveData(log, itemId);
        var body = await response.text();
        context.res = {
            body
        };
    } catch (error) {
        log('Error from try...catch of getDataById');
        log.error(error ? error.message : 'Error from getDataById -> dataService.retrieveData');
        context.res = {
            status: 500,
            body: "Error occurred when fetch data by Id from the Zendesk API - " + error.name
        };
    }
};

export default httpTrigger;