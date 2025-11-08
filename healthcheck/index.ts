import { AzureFunction, Context, HttpRequest, Logger } from '@azure/functions';
import * as fs from 'fs';
import healthcheckService from '../shared/services/healthcheckService';

const httpTrigger: AzureFunction = async (context: Context, req: HttpRequest): Promise<void> => {
    const log: Logger = context.log;
    const operationId = '[healthchecks]';
    log.info(operationId, 'HTTP trigger function processed a request for healthchecks.');

    const pkg: any = JSON.parse(fs.readFileSync('./package.json').toString());
    const showDetail = req.query.showDetail;

    if (pkg) {
        const appName = pkg.name;
        const appVersion = pkg.version;
        const protocol = req.url.substring(0, 5) === 'https' ? 'https://' : 'http://';
        const host = req.headers.host;
        const baseUrl = `${protocol}${host}`;

        let checkResult = await healthcheckService.verify(log);
        if (!checkResult) {
            checkResult = 'EVERYTHINGISOK';
        }

        if (showDetail && showDetail.toLowerCase() === 'true') {
            context.res = {
                headers: {
                    'Content-Type': 'application/json',
                },
                body: { appName, appVersion, baseUrl, checkResult },
            };
        } else {
            context.res = {
                headers: {
                    'Content-Type': 'application/json',
                },
                body: checkResult,
            };
        }
    } else {
        context.res = {
            statusCode: 400,
            body: 'Cannot find package.json file',
        };
    }
};

export default httpTrigger;
