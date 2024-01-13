build-docker:
	docker build . -t mlynar:latest --build-arg MLYNAR_VERSION=${MLYNAR_VERSION}

start:
	kubectl apply -f ./examples/k8s/deployment.yaml
stop:
	kubectl delete -f ./examples/k8s/deployment.yaml

redeploy: build-docker push stop start

deploy: build-docker push start

push:
	docker tag mlynar ffluffyhedgehog/mlynar:${MLYNAR_VERSION}
	docker push ffluffyhedgehog/mlynar:${MLYNAR_VERSION}
	docker tag mlynar ffluffyhedgehog/mlynar:latest
	docker push ffluffyhedgehog/mlynar:latest
