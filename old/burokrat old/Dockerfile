FROM texlive/texlive:latest-basic

USER root
RUN apt update && apt install -y python3 python3-pip

RUN tlmgr update --self
RUN apt install -y texlive-latex-base texlive-fonts-recommended texlive-latex-extra \
    && apt install -y latexmk

WORKDIR /app
COPY requirements.txt /app/
RUN pip install -r requirements.txt --break-system-packages

COPY latex /app/latex
RUN latexmk -cd -pdf latex/test_finding.tex
RUN latexmk -cd -C latex/*.tex
COPY src /app/src
COPY config.yaml /app/
COPY mitre_techniques.json /app/

EXPOSE 8501

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["streamlit run /app/src/gui.py"]
