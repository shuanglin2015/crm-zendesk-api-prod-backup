import { AzureFunction, Context, Logger } from "@azure/functions"
import searchService from '../shared/services/searchForTimerTriggerService';
import crmUtil from '../shared/utils/crmUtil';
import util from '../shared/utils/util';

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
        let accessToken = await crmUtil.getAccessToken(log);

        // how to check entity usage:
        // https://admin.powerplatform.microsoft.com/manage/dataverse/b5078973-bacd-4581-8691-802a586ff9e1/contentusage
        // let report = await searchService.getCapacityReport(accessToken);
        // for (const env of report.value) {
        //     const props = env.properties;
        //     console.log(`Env: ${props.displayName} (${env.name})`);
        //     if (props.capacity) {
        //         for (const cap of props.capacity) {
        //         console.log(`  - ${cap.capacityType}: ${cap.actualConsumption} ${cap.capacityUnit}`);
        //         }
        //     } else {
        //         console.log('  - No capacity info returned');
        //     }
        // }

        let activeCountries = await searchService.getActiveCountries(accessToken, log);
        let zendeskCountries = [];
        let isStage = false;  // Production
        let countryFieldId = isStage ? 31959436739604 : 35138178531732;
        if (activeCountries.length > 0) {
            await util.asyncForEach(activeCountries, async countryName => {
                // get Zendesk country name by friendly country name in IM360:
                let zendeskCountryName = await searchService.getCustomFieldCountryValue(log, countryFieldId.toString(), countryName);
                if (zendeskCountryName) {
                    zendeskCountries.push(zendeskCountryName);
                }
            });
        }

        // (type:ticket custom_field_35138178531732:"gbl_cs_country_united_states") OR (type:ticket custom_field_35138178531732:"gbl_cs_country_united_kingdom")
        // let zendeskCountriesFilter = searchService.buildCountrySearchQuery(countryFieldId, zendeskCountries);
        
        // get latest created_at value from CRM

        let i = 0;
        await searchService.loopUntil(async () => {
            i ++;
            if (i == 20) {
                return true;  // stop when i = 20
            }

            await util.asyncForEach(zendeskCountries, async zendeskCountry => {
                const latestCreatedAt = await searchService.getLatestCreatedAtValue(accessToken, log, zendeskCountry);
                if (latestCreatedAt && latestCreatedAt != '-') {
                    createdDateStart = latestCreatedAt;
                }
                let formName = 'gbl - partner support';
                let endPage = '';
                let ticketId = '';
                let withoutUpdatedDate = 'true';
                const items = await searchService.retrieveData(log, accessToken, updatedDateStart, updatedDateEnd, createdDateStart, createdDateEnd, limit, formName, endPage, ticketId, withoutUpdatedDate, zendeskCountry);
                let totalRecords = items && items.length;
                let result = `Created ${totalRecords} tickets`;
                log(result);
            })

        });

    } catch (error) {
        log("Error occurred in insertZendeskTicketsTimerTrigger API - " + error.message);
    }
};

export default timerTrigger;
