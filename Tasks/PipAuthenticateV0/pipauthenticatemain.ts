import * as path from "path";
import * as pkgLocationUtils from "utility-common/packaging/locationUtilities";
import * as telemetry from "utility-common/telemetry";
import * as tl from "vsts-task-lib";
import * as auth from "./authentication";
import * as utils from "./utilities";

async function main(): Promise<void> {
    tl.setResourcePath(path.join(__dirname, "task.json"));

    try {
        let packagingLocation: string;

        let pipEnvVar: string = "";
        if (tl.getVariable("PIP_EXTRA_INDEX_URL")) {
            pipEnvVar = tl.getVariable("PIP_EXTRA_INDEX_URL");
        }

        const feedIds  = tl.getDelimitedInput("feedList", ",");

        // Local feeds
        if (feedIds)
        {
            tl.debug(tl.loc("Info_AddingInternalFeeds", feedIds.length));
            const serviceUri = tl.getEndpointUrl("SYSTEMVSSCONNECTION", false);
            const localAccessToken = pkgLocationUtils.getSystemAccessToken();
            try {
                // This call is to get the packaging URI(abc.pkgs.vs.com) which is same for all protocols.
                packagingLocation = await pkgLocationUtils.getNuGetUriFromBaseServiceUri(
                    serviceUri,
                    localAccessToken);
            } catch (error) {
                tl.debug(tl.loc("FailedToGetPackagingUri"));
                tl.debug(JSON.stringify(error));
                packagingLocation = serviceUri;
            }
            const globalWebApi = utils.getWebApi(packagingLocation, localAccessToken);
            for (const feedId of feedIds) {
                const feedUri = await utils.getPyPiSimpleApiFromFeedId(globalWebApi, feedId);
                const pipUri = utils.formPipCompatibleUri("build", localAccessToken, feedUri);
                pipEnvVar = pipEnvVar + " " + pipUri;
            }
        }

        // external service endpoints
        let endpointNames = tl.getDelimitedInput("externalSources", ',');

        const externalEndpoints = auth.getExternalAuthInfoArray(endpointNames);
        externalEndpoints.forEach((id) => {
            const externalPipUri = utils.formPipCompatibleUri(id.username, id.password, id.packageSource.feedUri);
            pipEnvVar = pipEnvVar + " " + externalPipUri;
        });

        // Setting variable
        tl.setVariable("PIP_EXTRA_INDEX_URL", pipEnvVar, false);
        console.log(tl.loc("Info_SuccessAddingAuth", feedIds.length, externalEndpoints.length));

        const pipauthvar = tl.getVariable("PIP_EXTRA_INDEX_URL");
        if (pipauthvar.length < pipEnvVar.length){
            tl.warning(tl.loc("Warn_TooManyFeedEntries"));
        }
        tl.debug(pipEnvVar);
    }
    catch (error) {
        tl.error(error);
        tl.setResult(tl.TaskResult.Failed, tl.loc("FailedToAddAuthentication"));
        return;
    } finally{
        _logPipAuthStartupVariables();
    }
}

// Telemetry
function _logPipAuthStartupVariables() {
    try {
        const pipAuthenticateTelemetry = {
            "System.TeamFoundationCollectionUri": tl.getVariable("System.TeamFoundationCollectionUri"),
            };

        telemetry.emitTelemetry("Packaging", "PipAuthenticate", pipAuthenticateTelemetry);
    } catch (err) {
        tl.debug(`Unable to log Pip Authenticate task init telemetry. Err:( ${err} )`);
    }
}

main();
