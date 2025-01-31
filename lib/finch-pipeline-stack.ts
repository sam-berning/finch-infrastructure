import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import { FinchPipelineAppStage } from './finch-pipeline-app-stage';
import { ENVIRONMENT_STAGE } from './finch-pipeline-app-stage';
import { EnvConfig } from '../config/env-config';
import { RunnerConfig } from '../config/runner-config';

export class FinchPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const source = CodePipelineSource.gitHub('runfinch/infrastructure', 'main', {
      authentication: cdk.SecretValue.secretsManager('pipeline-github-access-token')
    });

    const pipeline = new CodePipeline(this, 'FinchPipeline', {
      pipelineName: 'FinchPipeline',
      crossAccountKeys: true,
      synth: new ShellStep('Synth', {
        input: source,
        commands: ['npm ci', 'npm run build', 'npx cdk synth']
      })
    });

    const betaApp = new FinchPipelineAppStage(this, 'Beta', {
      environmentStage: ENVIRONMENT_STAGE.Beta,
      env: {
        account: EnvConfig.envBeta.account,
        region: EnvConfig.envBeta.region
      },
      runnerConfig: RunnerConfig.runnerBeta
    });
    const betaStage = pipeline.addStage(betaApp);
    // add a post step for unit and integration tests
    betaStage.addPost(
      new ShellStep('Unit and Integration Test', {
        input: source,
        commands: ['npm install', 'npm run build', 'npm run test', 'npm run integration'],
        envFromCfnOutputs: {
          CLOUDFRONT_URL: betaApp.artifactBucketCloudfrontUrlOutput
        }
      })
    );
    // Add stages to a wave to deploy them in parallel.
    const wave = pipeline.addWave('wave');

    const prodApp = new FinchPipelineAppStage(this, 'Production', {
      environmentStage: ENVIRONMENT_STAGE.Prod,
      env: {
        account: EnvConfig.envProd.account,
        region: EnvConfig.envProd.region
      },
      runnerConfig: RunnerConfig.runnerProd
    });
    wave.addStage(prodApp);

    const releaseApp = new FinchPipelineAppStage(this, 'Release', {
      environmentStage: ENVIRONMENT_STAGE.Release,
      env: {
        account: EnvConfig.envRelease.account,
        region: EnvConfig.envRelease.region
      },
      runnerConfig: RunnerConfig.runnerRelease
    });
    wave.addStage(releaseApp);
  }
}
