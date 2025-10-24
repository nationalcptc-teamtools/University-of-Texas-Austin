# burokrat

## Docker Compose Setup (Recommended)
* Edit `config.yaml` with your name
* Create local directories for volumes (if they don't exist):
* Start the application: `docker compose up -d`
* View logs: `docker compose logs -f`
* Stop the application: `docker compose down`
* Restart the application: `docker compose restart`
* Access the Streamlit GUI at `http://localhost:8501`

## Docker Setup (Manual)
* Edit `config.yaml` with your name
* Build image: `docker build -t hash/cptc-report .`
* Run image: `docker run -d -p 8501:8501 -v <local image folder>:/app/images -v <local findings folder>:/app/vuln-data hash/cptc-report`
* Optionally add `-v ./config.yaml:/app/config.yaml` if you edit config after building docker image
* Optionally add `-v <local pdf folder>:/app/vuln-pdfs` if you want to view generated PDFs
* `docker ps -a` to view all containers
* `docker image ls` to view all images
* `docker stop/start <container>` to stop/start a container
* `docker container prune` to remove all stopped containers
* `docker image prune` to remove all untagged and not in use images
* `docker image prune -a` to remove all images not in use

## Using Latex
* There is a code macro for use in exploit details and remediation for one line commands: `\code{<command>}`
* Can add links with `\url{<link>}` or `\href{<link>}{<text>}`
    * References section will automatically generate `href` elements from input
* After placing images in the images folder and mounting volume to docker, use `\evidence{<image file>}{<width>}{<caption>}` to add image
    * Specify relative width like `0.5\textwidth` or can specify absolute width with `1in` or `1cm` etc
    * Image file should just be the file name (don't include the directory)
    * Can use `\ref{fig:<image file>}` to get figure number to reference image
