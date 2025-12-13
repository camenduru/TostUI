🐣 Please follow me for new updates https://x.com/camenduru <br />
🔥 Please join our discord server https://discord.gg/k5BwmmvJJU <br />
🥳 Please become my sponsor https://github.com/sponsors/camenduru <br />

### 🍞 Tost UI

### ☁︎ Cloud Service: [https://ui.tost.ai](https://ui.tost.ai) <br />

![Image](https://github.com/user-attachments/assets/594d9c1c-d652-4c5c-9ace-b4d7c08668ba) <br />
![Image](https://github.com/user-attachments/assets/33bace4e-a0df-463d-96f9-4393d3ee85ea)

### 🏠 Local and 🍇 RunPod Templates

| Local | Pod | Serverless | Info 
| --- | --- | --- | --- |
[![local](https://github.com/user-attachments/assets/2b9a6ec2-e6cd-4415-9553-6c7bfb5e7722)](https://github.com/camenduru/tostui?tab=readme-ov-file#-tostui---tost-synth-v10-z-image-turbo-seedvr2) | | | TostUI - Tost Synth v1.0
[![local](https://github.com/user-attachments/assets/2b9a6ec2-e6cd-4415-9553-6c7bfb5e7722)](https://github.com/camenduru/tostui?tab=readme-ov-file#-tostui---seedvr2) | | | TostUI - SeedVR2
[![local](https://github.com/user-attachments/assets/2b9a6ec2-e6cd-4415-9553-6c7bfb5e7722)](https://github.com/camenduru/tostui?tab=readme-ov-file#-tostui---z-image-turbo-with-lora) | | | TostUI - Z-Image-Turbo With LoRA
[![local](https://github.com/user-attachments/assets/2b9a6ec2-e6cd-4415-9553-6c7bfb5e7722)](https://github.com/camenduru/tostui?tab=readme-ov-file#-tostui---z-image-turbo-4bit) | | | TostUI - Z-Image-Turbo (4bit)
[![local](https://github.com/user-attachments/assets/2b9a6ec2-e6cd-4415-9553-6c7bfb5e7722)](https://github.com/camenduru/tostui?tab=readme-ov-file#-tostui---qwen-image-edit-2509-with-loras-8bit) | [![pod](https://github.com/user-attachments/assets/b1afe627-76ad-42fd-baaa-59be2259b224)](https://console.runpod.io/deploy?template=zbpfw59j23&ref=iqi9iy8y) | [![serverless](https://github.com/user-attachments/assets/99241dcd-7d87-4140-a779-d775bbbd674c)](https://console.runpod.io/deploy?template=kav9oydwre&ref=iqi9iy8y) | TostUI - Qwen Image Edit 2509 with LoRAs (8bit)
[![local](https://github.com/user-attachments/assets/2b9a6ec2-e6cd-4415-9553-6c7bfb5e7722)](https://github.com/camenduru/tostui?tab=readme-ov-file#-tostui---z-image-turbo-with-upscaler-8bit) | [![pod](https://github.com/user-attachments/assets/b1afe627-76ad-42fd-baaa-59be2259b224)](https://console.runpod.io/deploy?template=avc1aiksjc&ref=iqi9iy8y) | [![serverless](https://github.com/user-attachments/assets/99241dcd-7d87-4140-a779-d775bbbd674c)](https://console.runpod.io/deploy?template=xw7bgxhlhg&ref=iqi9iy8y) | TostUI - Z-Image-Turbo with Upscaler (8bit)
[![local](https://github.com/user-attachments/assets/2b9a6ec2-e6cd-4415-9553-6c7bfb5e7722)](https://github.com/camenduru/tostui?tab=readme-ov-file#-tostui---wan-22-image-to-video-8bit) | [![pod](https://github.com/user-attachments/assets/b1afe627-76ad-42fd-baaa-59be2259b224)](https://console.runpod.io/deploy?template=rg49nppdgd&ref=iqi9iy8y) | [![serverless](https://github.com/user-attachments/assets/99241dcd-7d87-4140-a779-d775bbbd674c)](https://console.runpod.io/deploy?template=bu7is6ath4&ref=iqi9iy8y) | TostUI - Wan 2.2 Image to Video (8bit)

`All services tested with an RTX 3090`

#### 🏠 TostUI - Tost Synth v1.0 (Z-Image-Turbo SeedVR2)

1.  **Install Docker**\
    [Download Docker Desktop (Windows AMD64)](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
    and run it.

2.  **Update the container (optional)**

    ``` bash
    docker stop tostui-z-image-turbo-seedvr2; docker rm tostui-z-image-turbo-seedvr2; docker pull camenduru/tostui-z-image-turbo-seedvr2
    ```

3.  **Run the container**\
    Open Command Prompt / PowerShell and paste:

    ``` bash
    docker run --gpus all -p 3000:3000 --name tostui-z-image-turbo-seedvr2 camenduru/tostui-z-image-turbo-seedvr2
    ```

    *Requires NVIDIA GPU (Min 6GB VRAM)*

4.  **Open app**\
    Go to: http://localhost:3000

#### 🏠 TostUI - SeedVR2

1.  **Install Docker**\
    [Download Docker Desktop (Windows AMD64)](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
    and run it.

2.  **Update the container (optional)**

    ``` bash
    docker stop tostui-seedvr2; docker rm tostui-seedvr2; docker pull camenduru/tostui-seedvr2
    ```

3.  **Run the container**\
    Open Command Prompt / PowerShell and paste:

    ``` bash
    docker run --gpus all -p 3000:3000 --name tostui-seedvr2 camenduru/tostui-seedvr2
    ```

    *Requires NVIDIA GPU (Min 6GB VRAM)*

4.  **Open app**\
    Go to: http://localhost:3000

#### 🏠 TostUI - Z-Image-Turbo With LoRA

1.  **Install Docker**\
    [Download Docker Desktop (Windows AMD64)](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
    and run it.

2.  **Update the container (optional)**

    ``` bash
    docker stop tostui-z-image-turbo; docker rm tostui-z-image-turbo; docker pull camenduru/tostui-z-image-turbo
    ```

3.  **Run the container**\
    Open Command Prompt / PowerShell and paste:

    ``` bash
    docker run --gpus all -p 3000:3000 --name tostui-z-image-turbo camenduru/tostui-z-image-turbo
    ```

    *Requires NVIDIA GPU (Min 6GB VRAM)*

4.  **Open app**\
    Go to: http://localhost:3000

#### 🏠 TostUI - Z-Image-Turbo (4bit)

1.  **Install Docker**\
    [Download Docker Desktop (Windows AMD64)](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
    and run it.

2.  **Update the container (optional)**

    ``` bash
    docker stop tostui-z-image-turbo-4bit; docker rm tostui-z-image-turbo-4bit; docker pull camenduru/tostui-z-image-turbo-4bit
    ```

3.  **Run the container**\
    Open Command Prompt / PowerShell and paste:

    ``` bash
    docker run --gpus all -p 3000:3000 --name tostui-z-image-turbo-4bit camenduru/tostui-z-image-turbo-4bit
    ```

    *Requires NVIDIA GPU (Min 6GB VRAM)*

4.  **Open app**\
    Go to: http://localhost:3000

#### 🏠 TostUI - Qwen Image Edit 2509 with LoRAs (8bit)
`Convert to Anime` `Convert to Reality T1` `Convert to Reality T2`
`Convert to Chibi`\
`Convert to Ahegao` `Convert to Color` `Convert to Kiss`
`Edit With Prompt`\
`Generate With Prompt` `Enhance Image Quality` `Next Scene`
`Multiple Angles`\
`Blend Image` `Relight Image` `Apply Texture` `Extract Outfit`
`Face Swap`

1.  **Install Docker**\
    [Download Docker Desktop (Windows AMD64)](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
    and run it.

2.  **Update the container (optional)**

    ``` bash
    docker stop tostui-qwen-image-edit-2509; docker rm tostui-qwen-image-edit-2509; docker pull camenduru/tostui-qwen-image-edit-2509
    ```

3.  **Run the container**

    ``` bash
    docker run --gpus all -p 3000:3000 --name tostui-qwen-image-edit-2509 camenduru/tostui-qwen-image-edit-2509
    ```

    *Requires NVIDIA GPU (Min 24GB VRAM)*

4.  **Open app**\
    Go to: http://localhost:3000

#### 🏠 TostUI - Z-Image-Turbo with Upscaler (8bit)

1.  **Install Docker**\
    [Download Docker Desktop (Windows AMD64)](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
    and run it.

2.  **Update the container (optional)**

    ``` bash
    docker stop tostui-z-image-turbo-8bit; docker rm tostui-z-image-turbo-8bit; docker pull camenduru/tostui-z-image-turbo-8bit
    ```

3.  **Run the container**

    ``` bash
    docker run --gpus all -p 3000:3000 --name tostui-z-image-turbo-8bit camenduru/tostui-z-image-turbo-8bit
    ```

    *Requires NVIDIA GPU (Min 24GB VRAM)*

4.  **Open app**\
    Go to: http://localhost:3000

#### 🏠 TostUI - Wan 2.2 Image to Video (8bit)

1.  **Install Docker**\
    [Download Docker Desktop (Windows AMD64)](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)
    and run it.

2.  **Update the container (optional)**

    ``` bash
    docker stop tostui-wan2-2-i2v-8bit; docker rm tostui-wan2-2-i2v-8bit; docker pull camenduru/tostui-wan2-2-i2v-8bit
    ```

3.  **Run the container**

    ``` bash
    docker run --gpus all -p 3000:3000 --name tostui-wan2-2-i2v-8bit camenduru/tostui-wan2-2-i2v-8bit
    ```

    *Requires NVIDIA GPU (Min 24GB VRAM)*

4.  **Open app**\
    Go to: http://localhost:3000
