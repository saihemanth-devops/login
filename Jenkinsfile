pipeline {
    agent any

    environment {
        // UPDATE THIS
        REGISTRY = "docker.io/gadeev" 
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
                        withSonarQubeEnv('SonarInternal') {
                            // Using Docker inside Jenkins to run scanner
                            sh """
                            docker run --rm --network host \
                            -v ${WORKSPACE}:/usr/src \
                            sonarsource/sonar-scanner-cli \
                            -Dsonar.projectKey=devsecops \
                            -Dsonar.sources=. \
                            -Dsonar.host.url=${SONAR_HOST} \
                            -Dsonar.login=\$SONAR_AUTH_TOKEN
                            """
                        }
                    }
                }
                stage('SCA: Trivy FS') {
                    steps {
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
                    def TEST_IP = sh(script: "kubectl get pod -n testing -l app=my-app -o jsonpath='{.items[0].status.podIP}'", returnStdout: true).trim()
                    
                    sh """
                    docker run --rm --ipc=host --network host \
                      -v ${WORKSPACE}/cypress:/e2e/cypress \
                      -v ${WORKSPACE}/cypress.config.js:/e2e/cypress.config.js \
                      -e CYPRESS_BASE_URL=http://${TEST_IP}:80 \
                      cypress/included:12.17.4 --headless
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
