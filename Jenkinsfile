pipeline {
    agent any

    environment {
        // UPDATE THIS
        REGISTRY = "docker.io/saihemanthcartrade" 
        IMAGE = "my-app"
        TAG = "${env.BUILD_NUMBER}"
        DOCKER_CREDS = credentials('docker-hub-creds')
        // Internal K8s DNS for SonarQube
        SONAR_HOST = "http://sonarqube.tools.svc.cluster.local:9000"
    }

    stages {
        stage('1. Security Checks') {
            parallel {
                stage('SAST: SonarQube') {
                    steps {
                        script {
                            // 1. Initialize the Tool we installed in Step 2
                            def scannerHome = tool 'SonarScanner' 
                            
                            // 2. Run Scanner Natively (Uses K8s Internal DNS)
                            withSonarQubeEnv('SonarInternal') {
                                sh """
                                ${scannerHome}/bin/sonar-scanner \
                                -Dsonar.projectKey=devsecops \
                                -Dsonar.sources=.
                                """
                            }
                        }
                    }
                }
                stage('SCA: Trivy FS') {
                    steps {
                        // Trivy still runs via Docker (That part is fine now!)
                        sh 'docker run --rm -v ${WORKSPACE}:/root/.cache/ aquasec/trivy fs . --severity CRITICAL --exit-code 1'
                    }
                }
            }
        }

        stage('2. Build & Push') {
            steps {
                script {
                    sh "docker build -t ${REGISTRY}/${IMAGE}:${TAG} ."
                    
                    // Scan Image
                    sh "docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity CRITICAL --exit-code 1 ${REGISTRY}/${IMAGE}:${TAG}"
                    
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
                    // 1. Get the IP of the running app
                    def TEST_IP = sh(script: "kubectl get pod -n testing -l app=my-app -o jsonpath='{.items[0].status.podIP}'", returnStdout: true).trim()
                    
                    // 2. Run Cypress with fixed Working Directory (-w)
                    sh """
                    docker run --rm --ipc=host --network host \
                      -v ${WORKSPACE}:/e2e \
                      -w /e2e \
                      -e CYPRESS_BASE_URL=http://${TEST_IP}:80 \
                      cypress/included:12.17.4 --headless --spec "cypress/e2e/login_spec.cy.js"
                    """
                }
            }
        }

        stage('5. Deploy to Prod (Node 3)') {
            steps {
                script {
                    sh "sed -i 's|image: .*|image: ${REGISTRY}/${IMAGE}:${TAG}|' k8s/production.yaml"
                    sh "kubectl apply -f k8s/production.yaml -n production"
                }
            }
        }
    }
}
