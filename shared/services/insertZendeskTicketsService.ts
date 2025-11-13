import { Logger } from '@azure/functions';
import fetch from 'node-fetch';

const  upsertZendeskTicket = async (log: Logger, accessToken: string, ticketData) => {
    const { im360_ticketid } = ticketData;
    let crmUrl = process.env.CRM_URL || "";

    try {
        // 1️⃣ Check if the record already exists
        const query = `${crmUrl}/api/data/v9.2/im360_zendeskticketses?$filter=im360_ticketid eq '${im360_ticketid}'`;
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
            const recordId = getData.value[0].im360_zendeskticketsid; // primary key GUID of the record
            const updatePayload = ticketData;

            const patchUrl = `${crmUrl}/api/data/v9.2/im360_zendeskticketses(${recordId})`;

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
            const postResponse = await fetch(`${crmUrl}/api/data/v9.2/im360_zendeskticketses`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(ticketData)
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
        log("❌ Error in upsertZendeskTicket:", err.message);
    }
}

export default {
    upsertZendeskTicket
};


/* Sample ticket data to insert or update
    const ticketData = {
        "im360_ticketid": "31290",
        "im360_name": "Zendesk Ticket from Azure Function",
        "im360_country": "United Kingdom",
        "im360_ingrambcn": "20666904",
        "im360_accountid": "8e70a94a-9a02-e911-a961-000d3a30e34c",
        "im360_domain": "Integrations",
        "im360_partneremailaddress": "sampat.somani@ingrammicro.com",
        "im360_priority": "Normal",
        "im360_resellername": "Sampan Somani",
        "im360_status": "Solved",
        "im360_zendeskticketsid": "40945691-a767-e911-a96a-000d3a30e34c",
        "im360_created_at": ""2025-10-10T06:13:51Znew Date()"",
        "im360_updated_at ": "2025-10-10T14:29:47Z",
        "im360_resolved_at ": "2025-10-10T07:06:33Z",
        "im360_resolvehours": 1
    };
*/
