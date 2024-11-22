FROM citusdata/pg_auto_failover:v2.0-pg14

RUN sudo apt-get remove -y tmux && sudo apt-get autoremove -y

RUN sudo apt-get update && sudo apt-get install -y python3 python3-pip

RUN pip3 install requests redis

COPY monitor_master_node.py /usr/local/bin/monitor_master_node.py

RUN sudo chmod +x /usr/local/bin/monitor_master_node.py