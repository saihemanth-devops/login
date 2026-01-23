pipeline {
    agent any

    environment {
        REGISTRY = "docker.io/saihemanthcartrade" 
        IMAGE = "my-app"
        TAG = "${env.BUILD_NUMBER}"
        DOCKER_CREDS = credentials('docker-hub-creds')
        SONAR_HOST = "http://localhost:30000" // Internal Host
        
        // Reporting Variables (Initialize Empty)
        TRIVY_FS_RESULT = "Not Run"
        TRIVY_IMAGE_RESULT = "Not Run"
        SONAR_RESULT = "Not Run"
        CYPRESS_RESULT = "Not Run"
    }

    stages {
        stage('1. Security Checks') {
            parallel {
                stage('SAST: SonarQube') {
                    steps {
                        script {
                            def scannerHome = tool 'SonarScanner'
                            withSonarQubeEnv('SonarInternal') {
                                try {
                                    sh "${scannerHome}/bin/sonar-scanner -Dsonar.projectKey=devsecops -Dsonar.sources=."
                                    SONAR_RESULT = "<b style='color:green'>PASSED</b>"
                                } catch (Exception e) {
                                    SONAR_RESULT = "<b style='color:red'>FAILED</b>"
                                    error "Sonar Failed"
                                }
                            }
                        }
                    }
                }
                stage('SCA: Trivy FS') {
                    steps {
                        script {
                            // Run Trivy and capture output to a file for parsing
                            // We use 'tee' so it shows in logs AND saves to file
                            sh "trivy fs . --severity CRITICAL > trivy_fs.log 2>&1"
                            
                            // Check if 'CRITICAL: 0' exists or grab the summary
                            def output = readFile('trivy_fs.log')
                            if (output.contains("CRITICAL: 0")) {
                                TRIVY_FS_RESULT = "<b style='color:green'>CLEAN</b>"
                            } else {
                                TRIVY_FS_RESULT = "<b style='color:red'>VULNERABILITIES FOUND</b>"
                                // Optional: Fail the build here if you want strict security
                                // error "Trivy FS Failed" 
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
                    
                    // Trivy Image Scan
                    sh "trivy image --severity CRITICAL ${REGISTRY}/${IMAGE}:${TAG} > trivy_image.log 2>&1"
                    def output = readFile('trivy_image.log')
                     if (output.contains("CRITICAL: 0")) {
                        TRIVY_IMAGE_RESULT = "<b style='color:green'>CLEAN</b>"
                    } else {
                        TRIVY_IMAGE_RESULT = "<b style='color:orange'>WARNING (Crit found)</b>"
                    }

                    withCredentials([usernamePassword(credentialsId: 'docker-hub-creds', passwordVariable: 'PASS', usernameVariable: 'USER')]) {
                        sh "echo $PASS | docker login -u $USER --password-stdin"
                        sh "docker push ${REGISTRY}/${IMAGE}:${TAG}"
                    }
                }
            }
        }

        stage('3. Deploy to Test') {
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
                    
                    // Host Path Fix for Cypress
                    def HOST_WORKSPACE = WORKSPACE.replace('/var/jenkins_home', '/data/jenkins')
                    
                    try {
                        sh """
                        docker run --rm --ipc=host --network host \
                          -v ${HOST_WORKSPACE}:/e2e \
                          -w /e2e \
                          -e CYPRESS_BASE_URL=http://${TEST_IP}:80 \
                          cypress/included:12.17.4 --headless --spec "cypress/e2e/login_spec.cy.js" > cypress.log 2>&1
                        """
                        CYPRESS_RESULT = "<b style='color:green'>ALL TESTS PASSED</b>"
                    } catch (Exception e) {
                        CYPRESS_RESULT = "<b style='color:red'>TESTS FAILED</b>"
                        error "Cypress Failed"
                    }
                }
            }
        }

        stage('5. Argo Canary (Prod)') {
            steps {
                script {
                    // Update Image
                    sh "sed -i 's|image: .*|image: ${REGISTRY}/${IMAGE}:${TAG}|' k8s/production.yaml"
                    
                    // Deploy Argo Rollout
                    sh "kubectl apply -f k8s/production.yaml -n production"
                    
                    // Watch the Rollout (This handles the 20% -> Wait -> 100% logic)
                    // If it fails, we abort automatically
                    try {
                        sh "kubectl-argo-rollouts status app-prod -n production --watch --timeout 60s"
                    } catch (Exception e) {
                        echo "Rollout Unhealthy! Rolling back..."
                        sh "kubectl-argo-rollouts undo app-prod -n production"
                        error "Deployment Failed - Rolled Back"
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                // Construct HTML Email
                def emailContent = """
                <h2>DevSecOps Pipeline Report - Build #${env.BUILD_NUMBER}</h2>
                <table border="1" cellpadding="5" style="border-collapse: collapse;">
                    <tr style="background-color: #f2f2f2;"><th>Tool</th><th>Status</th><th>Notes</th></tr>
                    <tr>
                        <td><b>SonarQube (SAST)</b></td>
                        <td>${SONAR_RESULT}</td>
                        <td><a href='${SONAR_HOST}'>View Dashboard</a></td>
                    </tr>
                    <tr>
                        <td><b>Trivy (FS Scan)</b></td>
                        <td>${TRIVY_FS_RESULT}</td>
                        <td>Checked for Critical Vulns</td>
                    </tr>
                    <tr>
                        <td><b>Trivy (Image Scan)</b></td>
                        <td>${TRIVY_IMAGE_RESULT}</td>
                        <td>${REGISTRY}/${IMAGE}:${TAG}</td>
                    </tr>
                    <tr>
                        <td><b>Cypress (E2E)</b></td>
                        <td>${CYPRESS_RESULT}</td>
                        <td>Smoke Test on Node 2</td>
                    </tr>
                </table>
                <br>
                <p>Check console output for full logs.</p>
                """

                emailext (
                    subject: "Pipeline Report: ${currentBuild.currentResult}",
                    body: emailContent,
                    mimeType: 'text/html',
                    to: "saihemanth0827@gmail.com"
                )
            }
        }
    }
}
