pipeline {
    agent any

    environment {
        REGISTRY = "docker.io/saihemanthcartrade" 
        IMAGE = "my-app"
        TAG = "${env.BUILD_NUMBER}"
        DOCKER_CREDS = credentials('docker-hub-creds')
        // Internal K8s DNS for SonarQube (or localhost:30000 if using hybrid)
        SONAR_HOST = "http://sonarqube.tools.svc.cluster.local:9000"

        // REPORTING VARIABLES (Default to 'Not Run')
        TRIVY_FS_RESULT = "Not Run"
        TRIVY_IMAGE_RESULT = "Not Run"
        SONAR_RESULT = "Not Run"
        CYPRESS_RESULT = "Not Run"
        DEPLOY_RESULT = "Not Run"
    }

    stages {
        stage('1. Security Checks') {
            parallel {
                stage('SAST: SonarQube') {
                    steps {
                        script {
                            def scannerHome = tool 'SonarScanner' 
                            // Use try-catch to capture status without stopping the pipeline immediately
                            try {
                                withSonarQubeEnv('SonarInternal') {
                                    sh "${scannerHome}/bin/sonar-scanner -Dsonar.projectKey=devsecops -Dsonar.sources=."
                                }
                                SONAR_RESULT = "<b style='color:green'>PASSED</b>"
                            } catch (Exception e) {
                                SONAR_RESULT = "<b style='color:red'>FAILED</b>"
                                throw e // Re-throw to fail the build eventually
                            }
                        }
                    }
                }
                stage('SCA: Trivy FS') {
                    steps {
                        script {
                            // Capture output to file to check for vulnerabilities
                            // We use 'catchError' so the pipeline continues to the email step even if vulns are found
                            catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                                sh "docker run --rm -v ${WORKSPACE}:/root/.cache/ aquasec/trivy fs . --severity CRITICAL --exit-code 1 > trivy_fs.log 2>&1"
                                TRIVY_FS_RESULT = "<b style='color:green'>CLEAN</b>"
                            }
                            // If the previous command failed (exit code 1), update the status
                            if (currentBuild.result == 'FAILURE') {
                                TRIVY_FS_RESULT = "<b style='color:red'>CRITICAL VULNS FOUND</b>"
                            }
                        }
                    }
                }
            }
        }

        stage('2. Build & Push') {
            steps {
                script {
                    sh "docker build -t ${REGISTRY}/${IMAGE}:${TAG} ."
                    
                    // Scan Image
                    catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                        sh "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity CRITICAL --exit-code 1 ${REGISTRY}/${IMAGE}:${TAG} > trivy_image.log 2>&1"
                        TRIVY_IMAGE_RESULT = "<b style='color:green'>CLEAN</b>"
                    }
                    if (currentBuild.result == 'FAILURE') {
                         TRIVY_IMAGE_RESULT = "<b style='color:red'>CRITICAL VULNS FOUND</b>"
                    }

                    // Only push if secure (Optional: remove 'if' to push anyway)
                    withCredentials([usernamePassword(credentialsId: 'docker-hub-creds', passwordVariable: 'PASS', usernameVariable: 'USER')]) {
                        sh "echo $PASS | docker login -u $USER --password-stdin"
                        sh "docker push ${REGISTRY}/${IMAGE}:${TAG}"
                    }
                }
            }
        }

        stage('3. Deploy to Test (Node 2)') {
            steps {
                script {
                    sh "sed -i 's|image: .*|image: ${REGISTRY}/${IMAGE}:${TAG}|' k8s/testing.yaml"
                    sh "kubectl apply -f k8s/testing.yaml -n testing"
                    sh "kubectl rollout status deployment/app-test -n testing"
                }
            }
        }

        stage('4. Cypress Tests') {
            steps {
                script {
                    def TEST_IP = sh(script: "kubectl get pod -n testing -l app=my-app -o jsonpath='{.items[0].status.podIP}'", returnStdout: true).trim()
                    
                    // Host Path Fix
                    def HOST_WORKSPACE = WORKSPACE.replace('/var/jenkins_home', '/data/jenkins')
                    
                    try {
                        sh """
                        docker run --rm --ipc=host --network host \
                          -v ${HOST_WORKSPACE}:/e2e \
                          -w /e2e \
                          -e CYPRESS_BASE_URL=http://${TEST_IP}:80 \
                          cypress/included:12.17.4 --headless --spec "cypress/e2e/login_spec.cy.js"
                        """
                        CYPRESS_RESULT = "<b style='color:green'>PASSED</b>"
                    } catch (Exception e) {
                        CYPRESS_RESULT = "<b style='color:red'>FAILED</b>"
                        throw e
                    }
                }
            }
        }

        stage('5. Deploy to Prod (Canary)') {
            steps {
                script {
                    // Update Manifest
                    sh "sed -i 's|image: .*|image: ${REGISTRY}/${IMAGE}:${TAG}|' k8s/production.yaml"
                    
                    // Deploy Rollout object
                    sh "kubectl apply -f k8s/production.yaml -n production"
                    
                    // INTELLIGENT ROLLOUT WATCH
                    // This watches the 20% -> Pause -> 100% strategy
                    try {
                        echo "Starting Canary Rollout..."
                        sh "kubectl-argo-rollouts status app-prod -n production --watch --timeout 120s"
                        DEPLOY_RESULT = "<b style='color:green'>SUCCESS (100% Traffic)</b>"
                    } catch (Exception e) {
                        echo "Rollout Failed! Initiating Automatic Rollback..."
                        sh "kubectl-argo-rollouts undo app-prod -n production"
                        DEPLOY_RESULT = "<b style='color:red'>FAILED (Rolled Back)</b>"
                        error "Deployment failed and was rolled back."
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                def emailContent = """
                <html>
                <body>
                    <h2>Build #${env.BUILD_NUMBER} - ${currentBuild.currentResult}</h2>
                    <p><b>Project:</b> DevSecOps Pipeline</p>
                    
                    <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                        <tr style="background-color: #f2f2f2; text-align: left;">
                            <th>Stage</th>
                            <th>Status</th>
                            <th>Details</th>
                        </tr>
                        <tr>
                            <td>SonarQube (SAST)</td>
                            <td>${SONAR_RESULT}</td>
                            <td>Code Quality Scan</td>
                        </tr>
                        <tr>
                            <td>Trivy (Filesystem)</td>
                            <td>${TRIVY_FS_RESULT}</td>
                            <td>Dependency Vulnerabilities</td>
                        </tr>
                        <tr>
                            <td>Trivy (Image)</td>
                            <td>${TRIVY_IMAGE_RESULT}</td>
                            <td>Container Vulnerabilities</td>
                        </tr>
                        <tr>
                            <td>Cypress (E2E)</td>
                            <td>${CYPRESS_RESULT}</td>
                            <td>Browser Automation Test</td>
                        </tr>
                        <tr>
                            <td>Production Rollout</td>
                            <td>${DEPLOY_RESULT}</td>
                            <td>Argo Canary Deployment</td>
                        </tr>
                    </table>
                    
                    <br>
                    <p>Check the <a href="${env.BUILD_URL}console">Console Output</a> for detailed logs.</p>
                </body>
                </html>
                """

                emailext (
                    subject: "DevSecOps Report: Build ${env.BUILD_NUMBER} (${currentBuild.currentResult})",
                    body: emailContent,
                    mimeType: 'text/html',
                    to: "your-email@gmail.com"
                )
            }
        }
    }
}
