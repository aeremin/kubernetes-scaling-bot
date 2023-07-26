import { Telegraf } from 'telegraf';
import { http } from '@google-cloud/functions-framework';
import { v1 } from '@google-cloud/container';
import { AppsV1Api, KubeConfig } from "@kubernetes/client-node";

// Create the Cluster Manager Client
const client = new v1.ClusterManagerClient();

/**
 * The following function is equivalent to the 'get-credentials' call using
 * gcloud. The client assumes that the 'GOOGLE_APPLICATION_CREDENTIALS'
 * environment variable is set to the json key file associated to your GCP
 * service account (https://cloud.google.com/docs/authentication/production#create_service_account).
 *
 * The return values of this method are the credentials that are used to update
 * the k8s config file (~/.kube/config) to add a new context when
 * 'get-credentials' is invoked by the 'gcloud' CLI
 */
async function getCredentials(cluster: string, zone: string) {
    const projectId = await client.getProjectId();
    const accessToken = await client.auth.getAccessToken();
    const request = {
        projectId: projectId,
        name: `projects/${projectId}/locations/${zone}/clusters/${cluster}`
    };

    const [response] = await client.getCluster(request);
    // the following are the parameters added when a new k8s context is created
    return {
        // the endpoint set as 'cluster.server'
        endpoint: response.endpoint,
        // the certificate set as 'cluster.certificate-authority-data'
        certificateAuthority: response.masterAuth.clusterCaCertificate,
        // the accessToken set as 'user.auth-provider.config.access-token'
        accessToken: accessToken
    }
}
async function makeK8SApiClient(cluster: string, zone: string) {
    const k8sCredentials = await getCredentials(cluster, zone);
    const k8sClientConfig = new KubeConfig();
    k8sClientConfig.loadFromOptions({
        clusters: [{
            name: `my-gke-cluster_${cluster}`,            // any name can be used here
            caData: k8sCredentials.certificateAuthority,  // <-- this is from getCredentials call
            server: `https://${k8sCredentials.endpoint}`, // <-- this is from getCredentials call
        }],
        users: [{
            name: `my-gke-cluster_${cluster}`,
            authProvider: 'gcp',                          // the is not a required field
            token: k8sCredentials.accessToken             // <-- this is from getCredentials call
        }],
        contexts: [{
            name: `my-gke-cluster_${cluster}`,
            user: `my-gke-cluster_${cluster}`,
            cluster: `my-gke-cluster_${cluster}`
        }],
        currentContext: `my-gke-cluster_${cluster}`,
    });
    return k8sClientConfig.makeApiClient(AppsV1Api);
}

async function scale(zone: string, cluster: string, namespace: string, name: string, replicas: number) {
    const k8sApi = await makeK8SApiClient(cluster, zone);
    // find the particular deployment
    const res = await k8sApi.readNamespacedDeployment(name, namespace);
    console.log("Read a deployment");
    let deployment = res.body;

    // edit
    deployment.spec.replicas = replicas;

    // replace
    await k8sApi.replaceNamespacedDeployment(name, namespace, deployment);
    console.log("Replaced a deployment");
}

const ZONE = 'europe-west3';
const PROJECT_ID = 'alice-larp';
const CLUSTER = 'cost-cutting-autopilot';
const NAMESPACE = 'default';
const DEPLOYMENT_NAME = 'factorio';

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command('up', async (ctx) => {
    await scale(ZONE, CLUSTER, NAMESPACE, DEPLOYMENT_NAME, 1);
    await ctx.sendMessage("Done!");
});

bot.command('down', async (ctx) => {
    await scale(ZONE, CLUSTER, NAMESPACE, DEPLOYMENT_NAME, 0);
    await ctx.sendMessage("Done!");
});


if (process.env.NODE_ENV === 'production') {
    const url = `https://${ZONE}-${PROJECT_ID}.cloudfunctions.net/${process.env.FUNCTION_TARGET}`;
    bot.telegram.setWebhook(url).then(() => console.log(`Set webhook URL to ${url}`));
    http(process.env.FUNCTION_TARGET, async (req, res) => {
        await bot.handleUpdate(req.body, res);
    });
} else {
    bot.launch().then(() => console.log("Launched locally."));
}
