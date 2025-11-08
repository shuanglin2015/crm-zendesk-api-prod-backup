import { Logger } from '@azure/functions';
import fetch from 'node-fetch';

const  upsertZendeskConfig = async (log: Logger, accessToken: string, configData) => {
    const { im360_category, im360_key, im360_value } = configData;
    let crmUrl = process.env.CRM_URL || "";

    try {
        // 1️⃣ Check if the record already exists
        // example: https://im360gbldev.crm.dynamics.com/api/data/v9.2/im360_zendeskconfigs?$filter=im360_category eq 'ticket_fields' and im360_key eq '31042462931476' and im360_value eq 'gbl_cs_skill_subscription'
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskconfigs?$filter=im360_category eq '${im360_category}' and im360_key eq '${im360_key}' and im360_value eq '${im360_value}'`;
        const getResponse = await fetch(query, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Accept": "application/json"
            }
        });

        const getData = await getResponse.json();

        // 2️⃣ If record exists, update it (PATCH)
        if (getData.value && getData.value.length > 0) {
            const recordId = getData.value[0].im360_zendeskconfigid; // primary key GUID of the record
            const updatePayload = configData;

            const patchUrl = `${crmUrl}/api/data/v9.2/im360_zendeskconfigs(${recordId})`;

            const patchResponse = await fetch(patchUrl, {
                method: "PATCH",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(updatePayload)
            });

            if (patchResponse.ok) {
                log(`✅ Updated record ${recordId}`);
                return "UPDATE";
            } else {
                const err = await patchResponse.text();
                throw new Error(`Failed to update record: ${err}`);
            }
        } 
        // 3️⃣ If not found, create a new record (POST)
        else {
            const postResponse = await fetch(`${crmUrl}/api/data/v9.2/im360_zendeskconfigs`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(configData)
            });

            if (postResponse.ok) {
                const entityId = postResponse.headers.get("OData-EntityId");
                log(`✅ Created new record: ${entityId}`);
                return "INSERT";
            } else {
                const err = await postResponse.text();
                throw new Error(`Failed to create record: ${err}`);
            }
        }
    } catch (err) {
        log("❌ Error in upsertZendeskConfig:", err.message);
    }
}

export default {
    upsertZendeskConfig
};


/* Sample #1 - Zendesk config data to insert or update
    const configData = {
        "im360_category": "ticket_fields",
        "im360_key": "31042462931476",
        "im360_value": "gbl_cs_skill_subscription",
        "im360_name": "Subscription Management",
    };
*/

/* Sample #2 - Zendesk config users data to insert or update
    const configData = {
        "im360_category": "users",
        "im360_key": "36171835936404",
        "im360_value": "Shuang Lin Qu",
        "im360_name": "shuanglin.qu@ingrammicro.com",
    };
*/
