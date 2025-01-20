# Envi CONDA_ENV_NAME
CONDA_ENV_NAME = sankey
SHELL = cmd.exe
.SHELLFLAGS = /c

# Proxy settings
PROXY_HOST = tpaproxy.verizon.com
PROXY_PORT = 80
PROXY_URL = http://$(PROXY_HOST):$(PROXY_PORT)

# Set Python path
export PYTHONPATH = $(CURDIR)

.PHONY: build run test clean setup_env clean_env rebuild_env run_local run_pyspark run_pyspark_with_args proxy

# Function to check and create environment
define ensure_environment
    @echo "Current working directory: %CD%"
	@conda env list | findstr /i "$(CONDA_ENV_NAME)" > nul || (echo "Creating environment..." && conda env create -f environment.yml)
	@echo "Updating Conda environment..."
	@conda env update -f environment.yml
	@call activate $(CONDA_ENV_NAME) && pip install --upgrade Flask Werkzeug
endef

proxy:
	@echo "Configuring proxy settings..."
	@conda config --set proxy_servers.http $(PROXY_URL)
	@conda config --set proxy_servers.https $(PROXY_URL)
	@pip config set global.proxy $(PROXY_URL)

setup_env: proxy
	$(call ensure_environment)

# Set up conda environment
setup:
	@echo "Checking conda environment..."
	@conda env list | findstr /i "$(CONDA_ENV_NAME)" > nul || (echo "Creating environment..." && conda create -n $(CONDA_ENV_NAME) python=3.9 -y)

# Install packages using conda and pip with proxy awareness
install: setup
	@echo "Installing packages..."
	@call activate $(CONDA_ENV_NAME) && (conda install -y flask werkzeug)

run:
	@echo "Running application..."
	@call activate $(CONDA_ENV_NAME) && python run.py

# Clean environment
clean:
	@echo "Cleaning up..."
	@conda env remove -n $(CONDA_ENV_NAME) --yes
	@if exist "venv" rd /s /q venv
	@for /r %%i in (*.pyc) do del /q "%%i"
	@for /d /r %%i in (__pycache__) do rd /s /q "%%i"
