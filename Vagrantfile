# -*- mode: ruby -*-
# vi: set ft=ruby :

Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/xenial64"

  config.vm.provider "virtualbox" do |vb|
      vb.memory = "2048"
  end

  config.vm.provision "shell", inline: <<-SHELL
    apt-get update
    apt-get install -y git build-essential g++ nodejs npm
    curl https://install.meteor.com | sh
    cd /vagrant
    npm config set user 0
    npm config set unsafe-perm true
    meteor npm install
    chown ubuntu: -R `pwd`
    su ubuntu - meteor build .
  SHELL
end
