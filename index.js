const k8s = require('@kubernetes/client-node');

const kc = new k8s.KubeConfig();
kc.loadFromDefault();

const k8sApi = kc.makeApiClient(k8s.AppsV1Api);

const targetNamespaceName = 'bazel-test-drive';
const targetDeploymentName = 'server';

async function scale(namespace, name) {
    console.log("Starting");
    // find the particular deployment
    const res = await k8sApi.readNamespacedDeployment(name, namespace);
    console.log("Read a deployment");
    let deployment = res.body;

    // edit
    deployment.spec.replicas = 1 - deployment.spec.replicas;

    // replace
    await k8sApi.replaceNamespacedDeployment(name, namespace, deployment);
    console.log("Replaced a deployment");
}

scale(targetNamespaceName, targetDeploymentName).then(() => console.log("Success!")).catch(err => console.log(err));
