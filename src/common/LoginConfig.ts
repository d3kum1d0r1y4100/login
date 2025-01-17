import * as core from '@actions/core';
import { FormatType, SecretParser } from 'actions-secret-parser';

export class LoginConfig {
    static readonly azureSupportedCloudName = new Set([
        "azureusgovernment",
        "azurechinacloud",
        "azuregermancloud",
        "azurecloud",
        "azurestack"]);

    servicePrincipalId: string;
    servicePrincipalKey: string;
    tenantId: string;
    subscriptionId: string;
    resourceManagerEndpointUrl: string;
    allowNoSubscriptionsLogin: boolean;
    enableOIDC: boolean;
    environment: string;
    enableAzPSSession: boolean;
    audience: string;
    federatedToken: string;

    constructor() {
        this.enableOIDC = true;
    }

    async initialize() {
        this.environment = core.getInput("environment").toLowerCase();
        this.enableAzPSSession = core.getInput('enable-AzPSSession').toLowerCase() === "true";
        this.allowNoSubscriptionsLogin = core.getInput('allow-no-subscriptions').toLowerCase() === "true";

        this.servicePrincipalId = core.getInput('client-id', { required: false });
        this.servicePrincipalKey = null;
        this.tenantId = core.getInput('tenant-id', { required: false });
        this.subscriptionId = core.getInput('subscription-id', { required: false });

        this.audience = core.getInput('audience', { required: false });
        this.federatedToken = null;
        let creds = core.getInput('creds', { required: false });
        let secrets = creds ? new SecretParser(creds, FormatType.JSON) : null;

        if (creds) {
            core.debug('using creds JSON...');
            this.enableOIDC = false;
            this.servicePrincipalId = secrets.getSecret("$.clientId", true);
            this.servicePrincipalKey = secrets.getSecret("$.clientSecret", true);
            this.tenantId = secrets.getSecret("$.tenantId", true);
            this.subscriptionId = secrets.getSecret("$.subscriptionId", true);
            this.resourceManagerEndpointUrl = secrets.getSecret("$.resourceManagerEndpointUrl", false);
        }
        this.getFederatedTokenIfNecessary();
    }

    async getFederatedTokenIfNecessary() {
        if (!this.enableOIDC) {
            return;
        }
        try {
            this.federatedToken = await core.getIDToken(this.audience);
        }
        catch (error) {
            core.error(`Please make sure to give write permissions to id-token in the workflow.`);
            throw error;
        }
        if (!!this.federatedToken) {
            let [issuer, subjectClaim] = await jwtParser(this.federatedToken);
            console.log("Federated token details: \n issuer - " + issuer + " \n subject claim - " + subjectClaim);
        }
        else {
            throw new Error("Failed to fetch federated token.");
        }
    }

    async validate() {
        if (!this.servicePrincipalId || !this.tenantId || !(this.servicePrincipalKey || this.enableOIDC)) {
            throw new Error("Not all values are present in the credentials. Ensure clientId, clientSecret and tenantId are supplied.");
        }
        if (!this.subscriptionId && !this.allowNoSubscriptionsLogin) {
            throw new Error("Not all values are present in the credentials. Ensure subscriptionId is supplied.");
        }
        if (!LoginConfig.azureSupportedCloudName.has(this.environment)) {
            throw new Error("Unsupported value for environment is passed.The list of supported values for environment are ‘azureusgovernment', ‘azurechinacloud’, ‘azuregermancloud’, ‘azurecloud’ or ’azurestack’");
        }
    }
}

async function jwtParser(federatedToken: string) {
    let tokenPayload = federatedToken.split('.')[1];
    let bufferObj = Buffer.from(tokenPayload, "base64");
    let decodedPayload = JSON.parse(bufferObj.toString("utf8"));
    return [decodedPayload['iss'], decodedPayload['sub']];
}